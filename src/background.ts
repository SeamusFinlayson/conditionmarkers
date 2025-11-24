import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";

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
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
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
});
