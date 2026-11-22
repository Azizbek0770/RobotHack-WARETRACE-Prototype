import { useEffect, useRef, useState } from "react";

interface Props {
  onPhoto: (file: File) => void | Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission denied. Allow camera access or upload an image.";
    }
    if (error.name === "NotFoundError") {
      return "No camera was found. Use the image upload option.";
    }
  }
  return error instanceof Error ? error.message : "Unable to open camera.";
}

export default function CameraCapture({
  onPhoto,
  onError,
  disabled = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestNumber = useRef(0);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Free hardware even if the operator navigates away during permission prompt.
  useEffect(() => {
    return () => {
      requestNumber.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function stop() {
    requestNumber.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStarting(false);
    setActive(false);
  }

  async function start() {
    if (starting || active || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("Camera access requires localhost or HTTPS and a supported browser.");
      return;
    }

    const request = ++requestNumber.current;
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (request !== requestNumber.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (request !== requestNumber.current) return;
      setActive(true);
    } catch (error) {
      if (request !== requestNumber.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      onError(cameraError(error));
    } finally {
      if (request === requestNumber.current) setStarting(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!active || !video || capturing || disabled) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      onError("Camera is not ready. Try again in a moment.");
      return;
    }

    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image capture is unavailable in this browser.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (data) => (data ? resolve(data) : reject(new Error("Capture failed."))),
          "image/jpeg",
          0.82,
        );
      });

      await onPhoto(new File([blob], "waretrace-camera.jpg", { type: "image/jpeg" }));
    } catch (error) {
      onError(cameraError(error));
    } finally {
      setCapturing(false);
    }
  }

  return (
    <section className="intake-camera" aria-label="Camera scanner">
      <video
        aria-label="Live warehouse camera"
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="intake-video"
      />
      <div className="intake-camera-actions">
        {!active && !starting && (
          <button type="button" className="secondary-button" onClick={() => void start()} disabled={disabled}>
            Start camera
          </button>
        )}
        {(active || starting) && (
          <button type="button" className="secondary-button" onClick={stop}>
            Stop camera
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={!active || disabled || capturing}
          onClick={() => void capture()}
        >
          {capturing ? "Capturing…" : "Scan current frame"}
        </button>
      </div>
      <p className="muted">The camera runs only after you grant permission. Nothing is uploaded until you scan.</p>
    </section>
  );
}
