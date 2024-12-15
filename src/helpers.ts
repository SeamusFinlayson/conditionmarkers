import OBR, { Item, buildImage, isImage } from "@owlbear-rodeo/sdk";
import type { Image } from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";

type Bounds = { width:number, height:number }

export function isPlainObject(
  item: unknown
): item is Record<keyof any, unknown> {
  return (
    item !== null && typeof item === "object" && item.constructor === Object
  );
}

/** Update the selected state of the condition buttons */
export async function updateConditionButtons(items: Item[]) {
  const selection = await OBR.player.getSelection();
  // Remove all previous selected states
  document.querySelectorAll(".selected-icon").forEach(element => element.classList.remove("visible"));
  // Get all the markers that are attached to our current selection
  for (const item of items) {
    const metadata = item.metadata[getPluginId("metadata")];
    if (isPlainObject(metadata) &&
      metadata.enabled &&
      isImage(item) &&
      item.attachedTo &&
      selection?.includes(item.attachedTo)) {
      // Add selected state to this marker
      const condition = item.name.replace("Condition Marker - ", "");
      document.getElementById(`${condition}Select`)?.classList.add("visible");
    }
  }
}

/**
 * Helper to build and position a marker to match
 * the input image's size
 */
export async function buildConditionMarker(
  name: String,
  attached: Image,
  scale: number,
  attachedCount: number,
) {

  const sceneDpi = await OBR.scene.grid.getDpi();
  const bounds =  getImageBounds(attached, sceneDpi)
  const markerReturn = await getMarkerPosition(attached, attachedCount, bounds);

  const position = {
    x: markerReturn.x,
    y: markerReturn.y,
  };

  const rotation = markerReturn.rotation;
  const imageUrl = `https://conditiontracker.onrender.com/images/${name.toLowerCase().replace(/['-]/g, "").replace(/[ ]/g, "_")}.png`;
  
  const CONDITION_DPI = 150;

  const theImage = {
    width: CONDITION_DPI,
    height: CONDITION_DPI,
    mime: "image/jpg",
    url: imageUrl,
  }

  const desiredLength = 24;
  const imageScaleFactor = bounds.width / 150
  const imageInSceneDpi = (sceneDpi * CONDITION_DPI) / desiredLength / imageScaleFactor;

  const marker = buildImage(theImage, {
    offset: { x: 0, y: 0 },
    dpi: imageInSceneDpi,
  })
    .scale({ x: scale, y: scale })
    .rotation(rotation)
    .position(position)
    .attachedTo(attached.id)
    .locked(true)
    .name(`Condition Marker - ${name}`)
    .metadata({ [getPluginId("metadata")]: { enabled: true } })
    .layer("ATTACHMENT")
    .disableHit(false)
    .visible(attached.visible)
    .build();

  return marker;
}

function getImageBounds(item: Image, sceneDpi: number): Bounds {
  const dpiScale = sceneDpi / item.grid.dpi;
  const width = item.image.width * dpiScale * item.scale.x;
  const height = item.image.height * dpiScale * item.scale.y;
  return { width, height };
}

function translatePositionAfterRotation(centerX: number, centerY: number, x: number, y: number, theta: number) {  
  // Calculate the translation vector
  const tx = centerX - x;
  const ty = centerY - y;

  // Apply rotation to the translation vector
  const thetaRad = (theta * Math.PI) / 180;
  const rotatedTx = tx * Math.cos(thetaRad) - ty * Math.sin(thetaRad);
  const rotatedTy = tx * Math.sin(thetaRad) + ty * Math.cos(thetaRad);

  // Calculate the new position
  const newX = centerX - rotatedTx;
  const newY = centerY - rotatedTy;

  // Return the new position
  return [newX, newY];
}

/**
 * Gather the marker's position based on the image size and position and the
 * number of other markers on the image already
 */
async function getMarkerPosition(item: Image, count: number, bounds:Bounds) {
  const imgWidth = item.image.width;
  const imgHeight = item.image.height;

  let markersWide = 0;
  let markersTall = 0;
  let markerDimensionPos = 0;
  let markerDimensionSize = 0;

  //Figure out the image's aspect ratio
  //Divide the image's aspect ratio in to a grid (w/ a minimum of 5 on the shortest side)
  if (imgHeight / imgWidth > 1) {
    const height = imgHeight / imgWidth;
    markersWide = 5;
    markersTall = Math.round(height * 5);
    markerDimensionPos = bounds.height / markersTall;
    markerDimensionSize = imgHeight / markersTall;
  }
  else {
    const width = imgWidth / imgHeight;
    markersWide = Math.round(width * 5);
    markersTall = 5;
    markerDimensionPos = bounds.width / markersWide;
    markerDimensionSize = imgWidth / markersWide;
  }

  const itemLeft = item.position.x - bounds.width / 2 * item.scale.x;
  const itemTop = item.position.y - bounds.height / 2 * item.scale.y;

  let row = Math.floor(count / markersWide);
  let col = count % markersWide;
  
  let markerLeft = itemLeft + markerDimensionPos * col;
  let markerTop = itemTop + markerDimensionPos * row;

  //Reposition item based on rotation
  if (item.rotation !== 0) {
    //This almost works. 
    //Something might be wrong with the OBR API, because item.position and bounds.center both are giving top left for the selected item.
    //This works perfectly for 0, 90, 180, and 270, strangely.
    const newPos = translatePositionAfterRotation(item.position.x, item.position.y, markerLeft, markerTop, item.rotation);
    markerLeft = newPos[0];
    markerTop = newPos[1];
  }

  return {
    x: markerLeft,
    y: markerTop,
    size: markerDimensionSize,
    rotation: item.rotation,
  }
}

/**
 * Reposition a marker after one was deleted, always hug the upper left corner
 */
export async function repositionConditionMarker(item: Image) {
  //Grab all condition markers on the scene
  const conditionMarkers = await OBR.scene.items.getItems<Image>((item) => {
    const metadata = item.metadata[getPluginId("metadata")];
    return Boolean(isPlainObject(metadata) && metadata.enabled);
  });

  // Find all markers attached to this item
  const attachedMarkers = conditionMarkers.filter(
    (marker) => marker.attachedTo === item.id
  );

  // Get this marker's new position given it's new position in the grid
  const newMarkerInfo: { x: number; y: number, size: number }[] = [];
  const sceneDpi = await OBR.scene.grid.getDpi();
  const bounds = getImageBounds(item, sceneDpi)
  for (let i = 0; i < attachedMarkers.length; i++) {
    newMarkerInfo.push(await getMarkerPosition(item, i, bounds));
  }

  // Reposition the markers in the scene based on their new grid positions
  await OBR.scene.items.updateItems(attachedMarkers, (images) => {
    for (let i = 0; i < images.length; i++) {
      images[i].position.x = newMarkerInfo[i].x;
      images[i].position.y = newMarkerInfo[i].y;
    }
  });
}
