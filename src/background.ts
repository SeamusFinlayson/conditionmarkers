import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";
import { isImage, Math2 } from "@owlbear-rodeo/sdk";
import type { Image } from "@owlbear-rodeo/sdk";

import icon from "./icon.svg";

/**
 * This file represents the background script run when the plugin loads.
 * It creates the context menu item for the condition markers.
 */

OBR.onReady(() => {
  OBR.contextMenu.create({
    id: getPluginId("menu"),
    icons: [
      {
        icon,
        label: "Condition Markers",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER" },
          ],
          permissions: ["UPDATE"],
        },
      },
    ],
    onClick(_, elementId) {
      OBR.popover.open({
        id: getPluginId("condition-markers"),
        url: "/",
        height: 260,
        width: 260,
        anchorElementId: elementId,
      });
    },
    shortcut: "Shift + C"
  });

  // Listen for token changes to fix marker transformations
  OBR.scene.items.onChange(async (items) => {
    // Find tokens that have changed
    const changedTokens = items.filter((item): item is Image => 
      isImage(item) && 
      (item.layer === "CHARACTER" || item.layer === "MOUNT")
    );

    if (changedTokens.length === 0) return;

    // Get all condition markers
    const allItems = await OBR.scene.items.getItems();
    const conditionMarkers = allItems.filter((item): item is Image => {
      if (!isImage(item)) return false;
      const metadata = item.metadata[getPluginId("metadata")];
      return !!(metadata && typeof metadata === "object" && "enabled" in metadata && metadata.enabled);
    });

    // Get scene DPI
    const sceneDpi = await OBR.scene.grid.getDpi();

    // Find markers attached to changed tokens and calculate their correct transforms
    const markersToUpdate: Array<{ 
      id: string; 
      position: { x: number; y: number }; 
      rotation: number;
      scale: { x: number; y: number };
    }> = [];

    for (const token of changedTokens) {
      const attachedMarkers = conditionMarkers.filter(m => m.attachedTo === token.id);
      
      for (let i = 0; i < attachedMarkers.length; i++) {
        const marker = attachedMarkers[i];
        const newPosition = getMarkerPosition(token, i, sceneDpi);
        const newScale = getMarkerScale(token);
        
        // Only update if something changed
        if (
          marker.position.x !== newPosition.x ||
          marker.position.y !== newPosition.y ||
          marker.rotation !== 0 ||
          marker.scale.x !== newScale.x ||
          marker.scale.y !== newScale.y
        ) {
          markersToUpdate.push({
            id: marker.id,
            position: newPosition,
            rotation: 0,
            scale: newScale
          });
        }
      }
    }

    // Update markers if needed
    if (markersToUpdate.length > 0) {
      await OBR.scene.items.updateItems(
        markersToUpdate.map(m => m.id),
        (markers) => {
          for (let i = 0; i < markers.length; i++) {
            if (isImage(markers[i])) {
              markers[i].position = markersToUpdate[i].position;
              markers[i].scale = markersToUpdate[i].scale;
              markers[i].rotation = 0;
              markers[i].disableAttachmentBehavior = ["ROTATION", "SCALE"];
            }
          }
        }
      );
    }
  });
});

// Helper functions (duplicated from helpers.ts for background script)
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
  position = Math2.multiply(position, sceneDpi / imageItem.grid.dpi);
  
  // Use absolute scale to avoid position mirroring when token is flipped
  const absScale = {
    x: Math.abs(imageItem.scale.x),
    y: Math.abs(imageItem.scale.y),
  };

  position = {
    x: position.x * absScale.x,
    y: position.y * absScale.y
  };

  position = {
    x: position.x + imageItem.position.x,
    y: position.y + imageItem.position.y
  };

  return position;
}

function getMarkerScale(imageItem: Image) {
  // Use absolute scale to prevent markers from being flipped
  const scale = Math2.multiply(
    {
      x: Math.abs(imageItem.scale.x),
      y: Math.abs(imageItem.scale.x), // x is intentional, x and y must match
    },
    imageItem.image.width / imageItem.grid.dpi
  );
  return scale;
}
