/**
 * Face photo capture.
 *
 * Camera requires HTTPS or localhost. Photos are normalised to a 3:4
 * portrait at a bounded size before upload, so a clerk's phone camera
 * does not push multi-megabyte files over a weak connection.
 */

import { esc, html, $ } from "../lib/dom.js";
import { icon } from "./icons.js";
import { notify } from "./components.js";

const TARGET_W = 480;
const TARGET_H = 640;

let stream = null;
let host = null;

export function photoCaptureMarkup(existingDataUrl = "") {
  return html`
    <div class="photo-capture" data-photo-capture>
      <div class="photo-stage ${existingDataUrl ? "has-photo" : ""}" data-stage>
        ${
          existingDataUrl
            ? `<img src="${esc(existingDataUrl)}" alt="Captured face photo" data-photo-img />`
            : `<div class="placeholder">${icon("camera")}<small>No photo yet</small></div>`
        }
        <video data-video autoplay playsinline muted hidden></video>
      </div>

      <div class="photo-controls">
        <button class="btn btn-dark" type="button" data-act="start-camera">${icon("camera")} Open camera</button>
        <button class="btn btn-primary" type="button" data-act="capture" hidden>${icon("check")} Capture</button>
        <button class="btn btn-ghost" type="button" data-act="stop-camera" hidden>Cancel camera</button>

        <label class="btn btn-ghost" style="cursor:pointer">
          ${icon("file")} Upload a file
          <input type="file" accept="image/*" hidden data-act="upload" />
        </label>

        <button class="btn btn-ghost btn-sm" type="button" data-act="clear" ${existingDataUrl ? "" : "hidden"}>
          Remove photo
        </button>

        <ul class="photo-hints">
          <li>Face the camera squarely, eyes level.</li>
          <li>Plain background, good light, no hat or sunglasses.</li>
          <li>Shoulders visible inside the guide.</li>
        </ul>
        <input type="hidden" name="photo_data" data-photo-data value="${esc(existingDataUrl)}" />
      </div>
    </div>
  `;
}

/** Wire the capture controls. onChange receives a data URL or "". */
export function bindPhotoCapture(root, onChange) {
  host = root.querySelector("[data-photo-capture]");
  if (!host) return;

  const stage = host.querySelector("[data-stage]");
  const video = host.querySelector("[data-video]");
  const hidden = host.querySelector("[data-photo-data]");
  const btnStart = host.querySelector('[data-act="start-camera"]');
  const btnCapture = host.querySelector('[data-act="capture"]');
  const btnStop = host.querySelector('[data-act="stop-camera"]');
  const btnClear = host.querySelector('[data-act="clear"]');
  const fileInput = host.querySelector('[data-act="upload"]');

  function setPhoto(dataUrl) {
    hidden.value = dataUrl || "";
    stage.classList.toggle("has-photo", Boolean(dataUrl));
    stage.querySelector("[data-photo-img]")?.remove();
    stage.querySelector(".placeholder")?.remove();
    if (dataUrl) {
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "Captured face photo";
      img.dataset.photoImg = "";
      stage.prepend(img);
      btnClear.hidden = false;
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.innerHTML = `${icon("camera")}<small>No photo yet</small>`;
      stage.prepend(ph);
      btnClear.hidden = true;
    }
    onChange?.(dataUrl || "");
  }

  function showCameraUi(on) {
    video.hidden = !on;
    stage.classList.toggle("live", on);
    btnStart.hidden = on;
    btnCapture.hidden = !on;
    btnStop.hidden = !on;
    stage.querySelector("[data-photo-img]")?.toggleAttribute("hidden", on);
    stage.querySelector(".placeholder")?.toggleAttribute("hidden", on);
  }

  btnStart.onclick = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify.err("This browser cannot open a camera. Upload a photo file instead.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      video.srcObject = stream;
      showCameraUi(true);
    } catch (error) {
      console.error(error);
      const msg =
        error.name === "NotAllowedError"
          ? "Camera permission was refused. Allow it in the browser, or upload a file."
          : error.name === "NotFoundError"
            ? "No camera was found on this device."
            : "The camera could not be opened. Upload a photo file instead.";
      notify.err(msg);
    }
  };

  btnCapture.onclick = () => {
    if (!stream) return;
    const canvas = document.createElement("canvas");
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    drawCover(video, video.videoWidth, video.videoHeight, canvas);
    setPhoto(canvas.toDataURL("image/jpeg", 0.86));
    stopCamera();
    showCameraUi(false);
  };

  btnStop.onclick = () => {
    stopCamera();
    showCameraUi(false);
  };

  btnClear.onclick = () => setPhoto("");

  fileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify.err("Choose an image file.");
      return;
    }
    try {
      setPhoto(await fileToPortrait(file));
    } catch (error) {
      console.error(error);
      notify.err("That image could not be read.");
    }
    e.target.value = "";
  };
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function drawCover(source, sw, sh, canvas) {
  const ctx = canvas.getContext("2d");
  const targetRatio = canvas.width / canvas.height;
  const sourceRatio = sw / sh;
  let cw = sw;
  let ch = sh;
  if (sourceRatio > targetRatio) {
    cw = sh * targetRatio;
  } else {
    ch = sw / targetRatio;
  }
  const cx = (sw - cw) / 2;
  const cy = (sh - ch) / 2;
  ctx.drawImage(source, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
}

function fileToPortrait(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;
        drawCover(img, img.naturalWidth, img.naturalHeight, canvas);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
