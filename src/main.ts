import OBR, { Image, isImage, Item } from "@owlbear-rodeo/sdk";
import { conditions } from "./conditions";
import { getPluginId } from "./getPluginId";
import { buildConditionMarker, isPlainObject, updateConditionButtons, repositionConditionMarker } from "./helpers";
import "./style.css";
import { getImage } from "./images";

const PAGE_SIZE = 16;

let currentPage = 1;
let currentConditions = conditions.slice(0, PAGE_SIZE);

/**
 * This file represents the HTML of the popover that is shown once
 * the condition marker context menu item is clicked.
 */
OBR.onReady(async () => {
  // Setup the document with the condition buttons
  const appContainer = document.querySelector<HTMLDivElement>("#app");
  if (appContainer) {
    appContainer.innerHTML = `
      <div class="conditions">
        <div class="search-area">
          <input class="condition-filter" placeholder="Filter" type="search" id="search-bar"></input>
          <div class="clear-button-div">
            <button class="clear-button" tabindex="-1" type="button" aria-label="Clear" title="Clear">
              <img class="clear-button-img" src="${getImage("close")}"/>
            </button>
          </div>
        </div>
        <div class="lower-flex">
          <div class="page-left disabled">
            <img class="page-icon" src="${getImage("left")}"/>
          </div>
          <div class="conditions-area">
          </div>
          <div class="page-right">
            <img class="page-icon" src="${getImage("right")}"/>
          </div>
        </div>
      </div>
    `;
  }

  loadConditions();
  
  // Attach input listeners
  const input = document.querySelector(".condition-filter") as HTMLTextAreaElement;
  const inputClear = document.querySelector(".clear-button") as HTMLButtonElement;

  if (input) {
    input.addEventListener("input", () => {
      if (input.value !== "" && inputClear) {
        inputClear.style.visibility = "visible";
      }
      else if (inputClear) {
        inputClear.style.visibility = "hidden";
      }
      filterConditions(input.value);
    });
  }

  if (inputClear && input) {
    inputClear.addEventListener("click", () => {
      input.value = "";
      filterConditions(input.value);
      inputClear.style.visibility = "hidden";
      focusSearchBar();
    });
  }
  
  const pageLeft = document.querySelector(".page-left");
  const pageRight = document.querySelector(".page-right");

  if (pageLeft) {
    pageLeft.addEventListener("click", (event: Event) => {
      if (event && event.target) {
        const target = event.target as HTMLTextAreaElement
        if (!target.classList.contains("disabled") && currentPage > 1) {
          currentPage -= 1;
          showPage();
        }
      }
      focusSearchBar();
    });
  }

  if (pageRight) {
    pageRight.addEventListener("click", (event: Event) => {
      if (event && event.target) {
        const target = event.target as HTMLTextAreaElement
        if (!target.classList.contains("disabled") && currentPage < 4) {
          currentPage += 1;
          showPage();
        }
      }
      focusSearchBar();
    });
  }

  // Update the button states with the current selection
  const allItems = await OBR.scene.items.getItems();
  updateConditionButtons(allItems);

  // Add change listener for updating button states
  OBR.scene.items.onChange(updateConditionButtons);

  // Auto focus search bar
  focusSearchBar();

  // Attach keydown listener to close popover on "Escape" pressed
  document.addEventListener('keydown', (event) => {
    if (event.key == "Escape") {
      if (document.activeElement?.id === "search-bar") {
        OBR.popover.close(getPluginId("condition-markers"));
      } else {
        focusSearchBar();
      }
    }
  });
});

async function loadConditions() {
  const conditionsArea = document.querySelector(".conditions-area");

  if (conditionsArea) {
    conditionsArea.innerHTML = `
        ${currentConditions
          .map(
            (condition) =>
              `<button class="condition-button" id="${condition}">
                <div class="condition">
                  <img src="${getImage(condition)}"/>
                </div>
                <div class="selected-icon" id="${condition}Select"></div>
                <div class="condition-name"><p>${condition}</p></div>
              </button>`
          )
          .join("")}
    `;
  
    // Attach click and hover listeners
    const conditionButtons = document.querySelectorAll<HTMLButtonElement>(".condition-button");

    conditionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        handleButtonClick(button);
      });

      button.addEventListener("mouseover", () => {
        const conditionName = button.querySelector<HTMLDivElement>(".condition-name");
        if (conditionName) {
          conditionName.style.visibility = "visible";
        }
      });

      button.addEventListener("mouseout", () => {
        const conditionName = button.querySelector<HTMLDivElement>(".condition-name");
        if (conditionName) {
          conditionName.style.visibility = "hidden";
        }
      });
    });

    const allItems = await OBR.scene.items.getItems();
    updateConditionButtons(allItems);
  }
}

function showPage() {
  const pageLeft = document.querySelector(".page-left") as HTMLDivElement;
  const pageRight = document.querySelector(".page-right") as HTMLDivElement;

  if (pageLeft && pageRight) {
    switch (currentPage) {
      case 1:
        disablePage(pageLeft);
        enablePage(pageRight);
        currentConditions = conditions.slice(0, PAGE_SIZE);
        break;
      case 2:
        enablePage(pageLeft);
        enablePage(pageRight);
        currentConditions = conditions.slice(PAGE_SIZE, PAGE_SIZE * 2);
        break;
      case 3:
        enablePage(pageLeft);
        enablePage(pageRight);
        currentConditions = conditions.slice(PAGE_SIZE * 2, PAGE_SIZE * 3);
        break;
      case 4:
        enablePage(pageLeft);
        disablePage(pageRight);
        currentConditions = conditions.slice(PAGE_SIZE * 3, PAGE_SIZE * 4);
        break;
    }
    loadConditions();
  }
}

function disablePage(page: HTMLElement | null) {
  if (page) {
    page.classList.add("disabled");
  }
}

function enablePage(page: HTMLElement | null) {
  if (page) {
    page.classList.remove("disabled");
  }
}

async function filterConditions(filterString: string) {
  if (filterString.length === 0) {
    showPage();
    return;
  }

  disablePage(document.querySelector(".page-left"));
  disablePage(document.querySelector(".page-right"));

  const conditionsElem = document.querySelector(".conditions-area");
  const conditionsToAdd: HTMLElement[] = [];

  const [allItems, selection, conditionMarkers] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.player.getSelection(),
    // get condition markers already in the scene
    OBR.scene.items.getItems<Image>(item => {
      const metadata = item.metadata[getPluginId("metadata")];
      return Boolean(isPlainObject(metadata) && metadata.enabled);
    }),
  ]);

  const itemsSelected = allItems.filter(item => isImage(item) && selection?.includes(item.id));

  let attachedMarkers: Image[] = [];
  //Check whether this condition should be selected
  for (const item of itemsSelected) {
    // Find all markers attached to this item
    attachedMarkers = conditionMarkers.filter((marker) => marker.attachedTo === item.id);
  }

  for (const condition of conditions) {
    if (condition.toLowerCase().replace("-", "").replace("'", "").includes(filterString.toLowerCase())) {      const button = document.createElement("button");
      button.className = "condition-button";
      button.id = condition;

      const conditionDiv = document.createElement("div");
      conditionDiv.className = "condition";

      const conditionImg = document.createElement("img");
      conditionImg.setAttribute("src", getImage(condition));

      conditionDiv.appendChild(conditionImg);
      button.appendChild(conditionDiv);

      const selectedIcon = document.createElement("div");
      selectedIcon.className = "selected-icon";
      selectedIcon.id = `${condition}Select`;

      const conditionNameDiv = document.createElement("div");
      conditionNameDiv.className = "condition-name";
      conditionNameDiv.innerHTML = `<p>${condition}</p>`;

      button.appendChild(selectedIcon);
      button.appendChild(conditionNameDiv);
        
      button.addEventListener("click", () => {
        handleButtonClick(button);
      });

      button.addEventListener("mouseover", () => {
        const conditionName = button.querySelector<HTMLDivElement>(".condition-name");
        if (conditionName) {
          conditionName.style.visibility = "visible";
        }
      });

      button.addEventListener("mouseout", () => {
        const conditionName = button.querySelector<HTMLDivElement>(".condition-name");
        if (conditionName) {
          conditionName.style.visibility = "hidden";
        }
      });
      
      const matchedMarkers = attachedMarkers.filter((marker) => marker.name.includes(condition));
      if (matchedMarkers.length !== 0) {
        selectedIcon.style.visibility = "visible";
      }

      conditionsToAdd.push(button);
    }
  
    // Remove existing buttons and add filtered buttons
    const conditionsNow = document.querySelectorAll<HTMLButtonElement>(".condition-button");

    conditionsNow.forEach((button) => {
      conditionsElem?.removeChild(button);
    });

    conditionsToAdd.forEach((button) => {
      conditionsElem?.appendChild(button);
    });

    updateConditionButtons(allItems, selection);
  }
}

async function handleButtonClick(button: HTMLButtonElement) {
  const condition = button.id;
  let selected = false;

  const selectedButton = button.querySelector<HTMLDivElement>(".selected-icon");

  if (selectedButton && selectedButton.classList.contains("visible")) {
    selected = true;
  }

  const selection = await OBR.player.getSelection();

  if (selection) {
    const markersToAdd: Image[] = [];
    const markersToDelete: string[] = [];
    const itemsWithChangedMarkers: Image[] = [];

    const itemsSelected = await OBR.scene.items.getItems<Image>(selection);
    const conditionMarkers = await OBR.scene.items.getItems<Image>((item) => {
      const metadata = item.metadata[getPluginId("metadata")];
      return Boolean(isPlainObject(metadata) && metadata.enabled);
    });

    for (const item of itemsSelected) {
      const attachedMarkers = conditionMarkers.filter((marker) => marker.attachedTo === item.id);
      const matchedMarkers = attachedMarkers.filter((marker) => marker.name.includes(condition));

      if (selected) {
        markersToDelete.push(...matchedMarkers.map((marker) => marker.id));
        if (selectedButton) {
          selectedButton.style.visibility = "hidden";
          selectedButton.classList.remove("visible");
        }
        itemsWithChangedMarkers.push(item);
      } else {
        if (selectedButton) {
          selectedButton.style.visibility = "visible";
          selectedButton.classList.add("visible");
        }
        markersToAdd.push(await buildConditionMarker(condition, item, attachedMarkers.length));
      }
    }

    // Sync changes with scene
    await batchAddToScene(markersToAdd)
    await OBR.scene.items.deleteItems(markersToDelete);
    repositionConditionMarker(itemsWithChangedMarkers);
  }
}

//focus search bar
function focusSearchBar() {
  (document.getElementById("search-bar") as HTMLInputElement)?.select();
}

// Prevent errors when many items are added at onces
const MAX_UPDATE_LENGTH = 40;
async function batchAddToScene(items: Item[]) {
  for (let i = 0; i < Math.ceil(items.length / MAX_UPDATE_LENGTH); i++) {
    await OBR.scene.items.addItems(
      items.slice(
        i * MAX_UPDATE_LENGTH,
        (i + 1) * MAX_UPDATE_LENGTH
      )
    );
  }
}