// ==UserScript==
// @name        Round Mark
// @namespace   Violentmonkey Scripts
// @match       *://*/*
// @match       -removeme-file:///*/*
// @grant       none
// @version     1.0
// @author      fri
// @description Alt + double click to place a tiny bookmark. Alt + scroll to jump to it.
// ==/UserScript==

// Basic hotkeys:
// ALT + double click (anywhere) - place a bookmark
// ALT + scroll up/down          - jump between bookmarks
// ---
// Removing anchors:
// ALT + double click (on an anchor) - delete that bookmark
// ALT + middle mouse button         - delete all bookmarks

const anchorSize = 30; // pixels, diameter of the round bookmark
const fontSize = 18;   // pixels, size of the character inside the bookmark
const maxPageHeight = 1000000000 // pixels, used for calculations to find anchors' order on a page

class Css {
  static rules = `
body {
  position: relative;
}

.round-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${anchorSize}px;
  height: ${anchorSize}px;
  color: black;
  background: white;
  border-radius: 50%;
  position: absolute;
  z-index: 99999;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.5), 0 0 0 0 rgba(0, 0, 0, 0);
  transition: all 200ms;
}

.round-mark:hover {
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.5), 0 0 15px 0 rgba(0, 0, 0, 0.7);
}

.round-mark.active {
  color: white;
  background-color: #55aa55;
}

.round-mark .character {
  font-size: ${fontSize}px;
  font-weight: bold;
  pointer-events: none;
}

.round-mark .character::before {
  content: '';
  display: block;
  width: 0;
  height: 0;
  margin-top: -0.1em;
}

.round-mark .character::selection {
  color: inherit;
  background-color: transparent;
}
`;

  // Create style element and put the above stylesheet into it, so the anchors get styled nicely.
  static apply() {
    let styleElem = document.createElement("style");
    styleElem.type = "text/css";
    if (styleElem.styleSheet) styleElem.styleSheet.cssText = this.rules;
    else styleElem.innerHTML = this.rules;
    document.head.appendChild(styleElem);
  }
}

class Coordinates {
  // Get click position relative to the whole scrollable document, not just the visible part (viewport).
  static getClickXY(clickEvent) {
    const x = window.scrollX + event.clientX;
    const y = window.scrollY + event.clientY;
    return [x, y];
  }
  
  // Body can have margins. Remove them during calculations to keep precision.
  static getBodyOffsets() {
    const offsetX = parseInt(window.getComputedStyle(document.body).marginLeft);
    const offsetY = parseInt(window.getComputedStyle(document.body).marginTop);
    return [offsetX, offsetY];
  }
}

class Converter {
  // Used for ordering anchors. An anchor at the bottom is after one at the top.
  // If vertically the same, then right comes after left.
  static xyToOrder(x, y) {
    return parseInt(y) * maxPageHeight + parseInt(x);
  }
  
  // Extract X and Y from anchor's ID.
  static idToXY(id) {
    const [match, x, y] = id.match(/(\d+)-(\d+)/);
    return [x, y]; 
  }
  
  // Used for ordering anchors via XY coordinates in ID string. See xyToOrder method.
  static idToOrder(id) {
    return this.xyToOrder(...this.idToXY(id));
  }
  
  // Extract X and Y from anchor's order. Essentially reverse of idToOrder, as the name suggests.
  static orderToId(order) {
    const x = order % maxPageHeight;
    const y = (order - x) / maxPageHeight;
    return this.xyToId(x, y);
  }
  
  // Returns a human-friendly string for anchor element's ID.
  static xyToId(x, y) {
    return `round-mark-${Math.floor(x)}-${Math.floor(y)}`;
  }
}

class Characters {
  static alphabet = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  static index = 0;

  static getNext() {
    const character = this.alphabet.charAt(this.index++);
    if (this.index >= this.alphabet.length) {
      this.index = 0;
    }
    return character;
  }
}

class AnchorCreator {
  // Creates an element and assigns it some properties, but DOES NOT add it to the document.
  static create(x, y, character) {
    let anchor = document.createElement('div');
    anchor.id = Converter.xyToId(x, y);
    anchor.classList.add('round-mark');

    const [offsetX, offsetY] = Coordinates.getBodyOffsets();
    anchor.style.left = `${x - offsetX}px`;
    anchor.style.top = `${y - offsetY}px`;

    anchor.appendChild(this.createCharacter(character));

    return anchor;
  }
  
  static createCharacter(character) {
    let span = document.createElement('span');
    span.classList.add('character');
    span.innerHTML = character;
    return span;
  }
}

class Anchors {
  static items = [];
  static currentItemId = -1;

  // Returns ID of the anchor above the current one. Wraps around to the bottom if nothing found above.
  static getPreviousAnchorId() {
    const itemsWithoutCurrent = this.items.slice()
    itemsWithoutCurrent.splice(this.idToIndex(this.currentItemId), 1);
    const orderedIds = itemsWithoutCurrent.map(item => Converter.idToOrder(item.id));
    const idsLowerThanCurrent = orderedIds.filter(id => id < Converter.idToOrder(this.currentItemId));    
    let previousAnchorOrder = 0;
    if (idsLowerThanCurrent.length > 0) {
      previousAnchorOrder = Math.max(...idsLowerThanCurrent);
    } else {
      previousAnchorOrder = Math.max(...this.items.map(item => Converter.idToOrder(item.id)));
    }
    return Converter.orderToId(previousAnchorOrder);
  }

  // Returns ID of the anchor below the current one. Wraps around to the top if nothing found below.
  static getNextAnchorId() {
    const itemsWithoutCurrent = this.items.slice()
    itemsWithoutCurrent.splice(this.idToIndex(this.currentItemId), 1);
    const orderedIds = itemsWithoutCurrent.map(item => Converter.idToOrder(item.id));
    const idsHigherThanCurrent = orderedIds.filter(id => id > Converter.idToOrder(this.currentItemId));    
    let nextAnchorOrder = 0;
    if (idsHigherThanCurrent.length > 0) {
      nextAnchorOrder = Math.min(...idsHigherThanCurrent);
    } else {
      nextAnchorOrder = Math.min(...this.items.map(item => Converter.idToOrder(item.id)));
    }
    return Converter.orderToId(nextAnchorOrder);
  }

  // Scrolls to previous anchor in order.
  static showPrevious() {
    this.show(this.getPreviousAnchorId());
  }

  // Scrolls to next anchor in order.
  static showNext() {
    this.show(this.getNextAnchorId());
  }

  // Converts from anchors element's ID to items array index.
  static idToIndex(id) {
    return this.items.indexOf(this.items.find(item => item.id === id));
  }

  // Creates an anchor and sets it as current one.
  static add(x, y) {
    const character = Characters.getNext();
    const anchor = AnchorCreator.create(x, y, character);
    this.items.push({ id: anchor.id, element: anchor });
    this.setCurrent(this.items[this.items.length - 1]);
    document.body.appendChild(anchor);
    Hotkeys.bindDeleteAnchor(anchor);
  }

  // Scrolls to given anchor and sets it as current one.
  static show(id) {
    const anchor = this.items.find(item => item.id === id);
    const index = this.items.indexOf(anchor);
    if (index > -1) {
      anchor.element.scrollIntoViewIfNeeded();
      this.setCurrent(anchor);
    }
  }

  static setCurrent(anchor) {
    for (let item of this.items) {
      item.element.classList.remove('active');
    }
    anchor.element.classList.add('active');
    this.currentItemId = anchor.id;
  }

  // Removes the given anchor and sets the previous one as current.
  static remove(id) {
    const anchor = this.items.find(item => item.id === id);
    const index = this.items.indexOf(anchor);
    if (index > -1) {
      this.items.splice(index, 1);
      anchor.element.remove();
      this.currentItemId = this.getPreviousAnchorId();
    }
  }

  // Removes all anchors and resets the current one.
  static removeAll() {
    for (let item of this.items) {
      item.element.remove();
    }
    this.items = [];
    this.currentItemId = -1;
  }
}

// Polyfill from https://gist.github.com/hsablonniere/2581101
function initializeScrollIntoViewIfNeeded() {
  if (!Element.prototype.scrollIntoViewIfNeeded) {
    Element.prototype.scrollIntoViewIfNeeded = function (centerIfNeeded) {
      centerIfNeeded = arguments.length === 0 ? true : !!centerIfNeeded;
  
      let parent = this.parentNode,
          parentComputedStyle = window.getComputedStyle(parent, null),
          parentBorderTopWidth = parseInt(parentComputedStyle.getPropertyValue('border-top-width')),
          parentBorderLeftWidth = parseInt(parentComputedStyle.getPropertyValue('border-left-width')),
          overTop = this.offsetTop - parent.offsetTop < parent.scrollTop,
          overBottom = (this.offsetTop - parent.offsetTop + this.clientHeight - parentBorderTopWidth) > (parent.scrollTop + parent.clientHeight),
          overLeft = this.offsetLeft - parent.offsetLeft < parent.scrollLeft,
          overRight = (this.offsetLeft - parent.offsetLeft + this.clientWidth - parentBorderLeftWidth) > (parent.scrollLeft + parent.clientWidth),
          alignWithTop = overTop && !overBottom;
  
      if ((overTop || overBottom) && centerIfNeeded) {
        parent.scrollTop = this.offsetTop - parent.offsetTop - parent.clientHeight / 2 - parentBorderTopWidth + this.clientHeight / 2;
      }
  
      if ((overLeft || overRight) && centerIfNeeded) {
        parent.scrollLeft = this.offsetLeft - parent.offsetLeft - parent.clientWidth / 2 - parentBorderLeftWidth + this.clientWidth / 2;
      }
  
      if ((overTop || overBottom || overLeft || overRight) && !centerIfNeeded) {
        this.scrollIntoView(alignWithTop);
      }
    };
  }
}

class Hotkeys {
  static bindAll() {
    this.bindAddAnchor();
    this.bindScrollToAnchor();
    this.bindDeleteAllAnchors();
  }
  
  static bindAddAnchor() {
    document.addEventListener('dblclick', event => {
      if (event.button === 0 && event.altKey) {
        const [x, y] = Coordinates.getClickXY(event);
        Anchors.add(x, y);
      }
    });
  }
  
  static bindScrollToAnchor() {
    document.addEventListener('wheel', event => {
      if (event.altKey) {
        const scrollingUp = event.deltaY < 0;
        if (scrollingUp) {
          Anchors.showPrevious();
        } else {
          Anchors.showNext();
        }
        event.preventDefault();
      }
    }, { passive: false });
  }
  
  static bindDeleteAnchor(element) {
    element.addEventListener('dblclick', event => {
      if (event.button === 0 && event.altKey) {
        Anchors.remove(element.id);
        event.stopPropagation();
      }
    });
  }
  
  static bindDeleteAllAnchors() {
    document.addEventListener('mouseup', event => {
      if (event.button === 1 && event.altKey) {
        Anchors.removeAll();
        event.preventDefault();
      }
    });
  }
}

// Main function to initialize the script.
function init() {
  Css.apply();
  initializeScrollIntoViewIfNeeded();
  Hotkeys.bindAll();
}

init();
