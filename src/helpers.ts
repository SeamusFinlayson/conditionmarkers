import OBR, { Item, Math2, buildImage, isImage } from "@owlbear-rodeo/sdk";
import type { Image, ImageGrid, Vector2 } from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";

export function isPlainObject(
  item: unknown
): item is Record<keyof any, unknown> {
  return (
    item !== null && typeof item === "object" && item.constructor === Object
  );
}

/** Update the selected state of the condition buttons */
export async function updateConditionButtons(items: Item[], selection?: string[]) {
  if (selection === undefined) selection = await OBR.player.getSelection();
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
  attachedCount: number,
) {
  const sceneDpi = await OBR.scene.grid.getDpi();
  const imageUrl = `https://conditiontracker.onrender.com/images/${name.toLowerCase().replace(/['-]/g, "").replace(/[ ]/g, "_")}.png`;

  // Setup marker grid
  const CONDITION_DPI = 150;
  const markerImage = {
    width: CONDITION_DPI,
    height: CONDITION_DPI,
    mime: "image/jpg",
    url: imageUrl,
  }
  const desiredLength = sceneDpi * 0.16;
  const imageGrid: ImageGrid = {
    offset: { x: 0, y: 0 },
    dpi: (sceneDpi * CONDITION_DPI) / desiredLength ,
  }

  const builtMarker = buildImage(markerImage, imageGrid)
    .position(getMarkerPosition(attached, attachedCount, sceneDpi))
    .rotation(attached.rotation)
    .scale(getMarkerScale(attached))
    .attachedTo(attached.id)
    .locked(true)
    .name(`Condition Marker - ${name}`)
    .metadata({ [getPluginId("metadata")]: { enabled: true } })
    .layer("ATTACHMENT")
    .disableHit(false)
    .visible(attached.visible)
    .build();

  return builtMarker;
}

/**
 * Gather the marker's position based on the image size and position and the
 * number of other markers on the image already
 */
function getMarkerPosition(imageItem: Image, count: number, sceneDpi: number) {
  const MARKERS_PER_ROW = 5;

  // Find position with respect to image top left corner of image grid
  const markerGridPosition = {
    x: count % MARKERS_PER_ROW,
    y: Math.floor(count / MARKERS_PER_ROW),
  };
  const gridCellSpacing = imageItem.image.width / MARKERS_PER_ROW;
  let position = Math2.multiply(markerGridPosition, gridCellSpacing);

  // Find position with respect to item position
  position = Math2.subtract(position, imageItem.grid.offset);
  position = Math2.multiply(position, sceneDpi / imageItem.grid.dpi); // scale switch from image to scene
  position = Math2.multiply(position, imageItem.scale);
  position = Math2.rotate(position, { x: 0, y: 0 }, imageItem.rotation);

  // find position with respect to world
  position = Math2.add(position, imageItem.position);

  return position;
}

 /**
  * Get number of grid cells that the parent items spans horizontally
  */
function getMarkerScale(imageItem: Image) {
  const scale = Math2.multiply(
    {
      x: imageItem.scale.x,
      y: imageItem.scale.x, // x is intentional, x and y must match
    },
    imageItem.image.width / imageItem.grid.dpi
  );
  return scale;
}
 
/**
 * Reposition a marker after one was deleted, always hug the upper left corner
 */
export async function repositionConditionMarker(imageItems: Image[]) {
  //Grab all condition markers on the scene
  const conditionMarkers = await OBR.scene.items.getItems<Image>(item => {
    const metadata = item.metadata[getPluginId("metadata")];
    return Boolean(isPlainObject(metadata) && metadata.enabled);
  });

  let attachedMarkers: Image[] = [];
  let newMarker: { id: string; position: Vector2 }[] = [];
  for (const imageItem of imageItems) {
    // Find all markers attached to this item
    attachedMarkers = conditionMarkers.filter(
      marker => marker.attachedTo === imageItem.id
    );

    // Get this marker's new position given it's new position in the grid
    const sceneDpi = await OBR.scene.grid.getDpi();
    for (let i = 0; i < attachedMarkers.length; i++) {
      newMarker.push({
        id: attachedMarkers[i].id,
        position: getMarkerPosition(imageItem, i, sceneDpi),
      });
    }
  }

  // Reposition the markers in the scene based on their new grid positions
  await OBR.scene.items.updateItems(
    newMarker.map(marker => marker.id),
    images => {
      for (let i = 0; i < images.length; i++) {
        if (images[i].id !== newMarker[i].id)
          console.error("Condition marker ID mismatch, skipping item.");
        else images[i].position = newMarker[i].position;
      }
    }
  );
}