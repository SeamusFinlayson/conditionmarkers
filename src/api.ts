import OBR, { Image, isImage } from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";
import { conditions } from "./conditions";
import { buildConditionMarker, isPlainObject, repositionConditionMarker } from "./helpers";

const API_REQUEST_CHANNEL = getPluginId("api.request");
const API_RESPONSE_CHANNEL = getPluginId("api.response");

type RequestMessage =
  | {
    action: "addCondition" | "removeCondition";
    data: { tokenId: string; condition: string };
  }
  | {
    action: "removeAllConditions" | "getTokenConditions";
    data: { tokenId: string };
  }
  | {
    action: "getAvailableConditions";
  };

type ResponseMessage =
  | ({
    action: "addCondition" | "removeCondition";
    data: { tokenId: string; condition: string };
  } & (
      | {
        success: false;
        message: string;
      }
      | {
        success: true;
      }
    ))
  | ({
    action: "removeAllConditions";
    data: { tokenId: string };
  } & (
      | {
        success: false;
        message: string;
      }
      | {
        success: true;
      }
    ))
  | ({
    action: "getTokenConditions";
  } & (
      | {
        success: false;
        message: string;
      }
      | {
        success: true;
        data: { conditions: string[] };
      }
    ))
  | {
    action: "getAvailableConditions";
    success: true;
    data: { conditions: string[] };
  };


function normalizeCondition(conditionArray: string[]): string[] {
  return conditionArray.map((item) => item.replace(/[-]/g, "").replace(/[_]/g, " "));
}

const conditionsList = normalizeCondition(conditions);

async function sendApiResponse(message: ResponseMessage): Promise<void> {
  await OBR.broadcast.sendMessage(
    API_RESPONSE_CHANNEL,
    message,
    { destination: "LOCAL" }
  );
}

function isConditionMarker(item: any): boolean {
  if (!isImage(item)) return false;
  const metadata = item.metadata[getPluginId("metadata")];
  return Boolean(isPlainObject(metadata) && metadata?.enabled);
}

function isValidRequestMessage(data: any): data is RequestMessage {
  if (!data?.action) return false;
  
  switch (data.action) {
    case "addCondition":
    case "removeCondition":
      return typeof data.data?.tokenId === "string" && typeof data.data?.condition === "string";
    case "removeAllConditions":
    case "getTokenConditions":
      return typeof data.data?.tokenId === "string";
    case "getAvailableConditions":
      return true;
    default:
      return false;
  }
}

export function setupConditionMarkersApi() {
  OBR.broadcast.onMessage(API_REQUEST_CHANNEL, async (evt) => {
    if (!isValidRequestMessage(evt.data)) {
      await sendApiResponse({
        action: (evt.data as any)?.action || "unknown",
        success: false,
        message: "Invalid request message format"
      });
      return;
    }
    
    const message = evt.data;

    switch (message.action) {
      case "addCondition": {
        const { tokenId, condition } = message.data;
        await addCondition(tokenId, condition);
        break;
      }
      case "removeCondition": {
        const { tokenId, condition } = message.data;
        await removeCondition(tokenId, condition);
        break;
      }
      case "removeAllConditions": {
        const { tokenId } = message.data;
        await removeAllConditions(tokenId);
        break;
      }
      case "getTokenConditions": {
        const { tokenId } = message.data;
        await getTokenConditions(tokenId);
        break;
      }
      case "getAvailableConditions": {
        await getAvailableConditions();
        break;
      }
    }
  });
}

async function addCondition(tokenId: string, condition: string) {
  // Validate condition
  if (!conditionsList.includes(condition)) {
    await sendApiResponse({
      action: "addCondition",
      success: false,
      message: "Invalid condition",
      data: { tokenId, condition }
    });
    return;
  }

  const allItems = await OBR.scene.items.getItems<Image>();
  const target = allItems.find((item) => item.id === tokenId);

  // Check if token exists
  if (!target) {
    await sendApiResponse({
      action: "addCondition",
      success: false,
      message: "Token not found",
      data: { tokenId, condition }
    });
    return;
  }

  // Check if condition already exists on token
  const markers = allItems.filter(isConditionMarker);
  const exists = markers.some((m) => m.attachedTo === tokenId && m.name === `Condition Marker - ${condition}`);

  if (exists) {
    await sendApiResponse({
      action: "addCondition",
      success: false,
      message: "Condition already exists on token",
      data: { tokenId, condition }
    });
    return;
  }

  // Add condition marker and reposition all markers on token
  const builtMarker = await buildConditionMarker(condition, target, markers.filter(m => m.attachedTo === tokenId).length);
  await OBR.scene.items.addItems([builtMarker]);
  await repositionConditionMarker([target]);

  await sendApiResponse({
    action: "addCondition",
    success: true,
    data: { tokenId, condition }
  });
}

async function removeCondition(tokenId: string, condition: string) {
  // Validate condition
  if (!conditionsList.includes(condition)) {
    await sendApiResponse({
      action: "removeCondition",
      success: false,
      message: "Invalid condition",
      data: { tokenId, condition }
    });
    return;
  }

  const allItems = await OBR.scene.items.getItems<Image>();
  const target = allItems.find((item) => item.id === tokenId);

  // Check if token exists
  if (!target) {
    await sendApiResponse({
      action: "removeCondition",
      success: false,
      message: "Token not found",
      data: { tokenId, condition }
    });
    return;
  }

  const markers = allItems.filter(isConditionMarker);
  const toDelete = markers.filter((m) => m.attachedTo === tokenId && m.name === `Condition Marker - ${condition}`);

  // Check if condition exists on token
  if (toDelete.length == 0) {
    await sendApiResponse({
      action: "removeCondition",
      success: false,
      message: "Condition not found on token",
      data: { tokenId, condition }
    });
    return;
  }

  // Remove condition marker and reposition remaining markers
  await OBR.scene.items.deleteItems(toDelete.map((m) => m.id));
  await repositionConditionMarker([target]);
  await sendApiResponse({
    action: "removeCondition",
    success: true,
    data: { tokenId, condition }
  });
}

async function removeAllConditions(tokenId: string) {
  const allItems = await OBR.scene.items.getItems<Image>();
  const target = allItems.find((item) => item.id === tokenId);

  // Check if token exists
  if (!target) {
    await sendApiResponse({
      action: "removeAllConditions",
      success: false,
      message: "Token not found",
      data: { tokenId }
    });
    return;
  }

  const markers = allItems.filter(isConditionMarker);
  const toDelete = markers.filter((m) => m.attachedTo === tokenId);

  // Check if any conditions exist on token
  if (toDelete.length == 0) {
    await sendApiResponse({
      action: "removeAllConditions",
      success: false,
      message: "No conditions found on token",
      data: { tokenId }
    });
    return;
  }

  // Remove condition markers
  await OBR.scene.items.deleteItems(toDelete.map((m) => m.id));
  await sendApiResponse({
    action: "removeAllConditions",
    success: true,
    data: { tokenId }
  });
}

async function getTokenConditions(tokenId: string) {
  const allItems = await OBR.scene.items.getItems<Image>();
  const target = allItems.find((item) => item.id === tokenId);

  // Check if token exists
  if (!target) {
    await sendApiResponse({
      action: "getTokenConditions",
      success: false,
      message: "Token not found"
    });
    return;
  }

  const markers = allItems.filter(isConditionMarker);
  const tokenMarkers = markers.filter((m) => m.attachedTo === tokenId);
  const tokenConditions = normalizeCondition(tokenMarkers.map((m) => m.name.replace("Condition Marker - ", "")));

  await sendApiResponse({
    action: "getTokenConditions",
    success: true,
    data: { conditions: tokenConditions }
  });
}

async function getAvailableConditions() {
  await sendApiResponse({
    action: "getAvailableConditions",
    success: true,
    data: { conditions: conditionsList }
  });
}