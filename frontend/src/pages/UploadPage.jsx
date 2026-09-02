import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

import TacticalScheme from "../components/TacticalScheme";

import "../upload-page.css";

const API_URL = import.meta.env.VITE_API_URL;

const CLIP_DURATION = 1;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0.00s";
  }

  return `${seconds.toFixed(2)}s`;
}

function FrameViewer({ frame }) {
  const containerRef = useRef(null);

  const [containerSize, setContainerSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!frame?.imageUrl) {
    return (
      <div
        style={{
          width: "100%",
          minHeight:"440px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#777",
          background: "#050505",
        }}
      >
        Waiting for frames...
      </div>
    );
  }

  const imageWidth = Number(frame.width) || 1920;
  const imageHeight = Number(frame.height) || 1080;

  const containerWidth = containerSize.width || 800;
  const containerHeight = containerSize.height || 500;

  const imageScale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  );

  const renderedWidth = imageWidth * imageScale;
  const renderedHeight = imageHeight * imageScale;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "440px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050505",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: `${renderedWidth}px`,
          height: `${renderedHeight}px`,
          flexShrink: 0,
        }}
      >
        <img
          src={frame.imageUrl}
          alt={`Frame ${frame.frame ?? 0}`}
          style={{
            display: "block",
            width: `${renderedWidth}px`,
            height: `${renderedHeight}px`,
            objectFit: "contain",
          }}
        />
      </div>
    </div>
  );
}

export default function UploadPage() {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);
  const ffmpegRef = useRef(null);
  const timelineRef = useRef(null);

  const dragRef = useRef({
    active: false,
    offsetX: 0,
  });

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [sceneId, setSceneId] = useState(null);
  const [error, setError] = useState("");
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegProgress, setFfmpegProgress] = useState(0);

  const clipDuration = Math.min(CLIP_DURATION, videoDuration || CLIP_DURATION);

  const maxStart = Math.max(0, videoDuration - CLIP_DURATION);

  const endTime = Math.min(startTime + CLIP_DURATION, videoDuration);

  const timelineStartPercent =
    videoDuration > 0 ? (startTime / videoDuration) * 100 : 0;

  const timelineWidthPercent =
    videoDuration > 0 ? (clipDuration / videoDuration) * 100 : 100;

  async function loadFFmpeg() {
    if (ffmpegRef.current && ffmpegLoaded) {
      return ffmpegRef.current;
    }

    setStatus("cutting");
    setStatusMessage("Loading FFmpeg...");

    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    ffmpeg.on("progress", ({ progress }) => {
      const value = Math.max(0, Math.min(100, progress * 100));

      setFfmpegProgress(value);

      console.log("[FFmpeg progress]", `${value.toFixed(1)}%`);
    });

    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      classWorkerURL: "/ffmpeg/worker.js",
    });

    ffmpegRef.current = ffmpeg;

    setFfmpegLoaded(true);
    setFfmpegProgress(100);

    console.log("FFmpeg loaded");

    return ffmpeg;
  }

  async function cutVideo(file, start, end) {
    const ffmpeg = await loadFFmpeg();

    const inputName = "input.mp4";
    const outputName = "clip.mp4";

    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore
    }

    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore
    }

    setStatus("cutting");
    setStatusMessage("Preparing video for FFmpeg...");
    setFfmpegProgress(0);

    const inputData = await fetchFile(file);

    await ffmpeg.writeFile(inputName, inputData);

    const duration = Math.max(0.01, end - start);

    setStatusMessage(
      `Cutting ${duration.toFixed(2)} seconds from ${start.toFixed(2)}s...`,
    );

    await ffmpeg.exec([
      "-ss",
      String(start),

      "-i",
      inputName,

      "-t",
      String(duration),

      "-c:v",
      "libx264",

      "-preset",
      "ultrafast",

      "-c:a",
      "aac",

      "-movflags",
      "+faststart",

      outputName,
    ]);

    const outputData = await ffmpeg.readFile(outputName);

    const blob = new Blob([outputData.buffer], {
      type: "video/mp4",
    });

    const clipFile = new File([blob], "clip.mp4", {
      type: "video/mp4",
    });

    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore
    }

    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore
    }

    setFfmpegProgress(100);

    return clipFile;
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);

    setVideoFile(file);
    setVideoUrl(url);

    setStatus("ready");
    setStatusMessage("Video ready");

    setProgress(0);
    setCurrentFrame(null);
    setFrameCount(0);
    setSceneId(null);
    setError("");

    setStartTime(0);
    setVideoDuration(0);
    setFfmpegProgress(0);
  }

  function handleVideoLoadedMetadata() {
    if (!videoRef.current) {
      return;
    }

    const duration = videoRef.current.duration;

    if (Number.isFinite(duration)) {
      setVideoDuration(duration);
      setStartTime(0);
    }
  }

  function setClipStart(value) {
    if (!videoDuration) {
      return;
    }

    const newStart = Math.max(0, Math.min(value, maxStart));

    setStartTime(newStart);

    if (videoRef.current) {
      videoRef.current.currentTime = newStart;
    }
  }

  function handlePlayClip() {
    if (!videoRef.current) {
      return;
    }

    const video = videoRef.current;

    const selectedStart = startTime;
    const selectedEnd = endTime;

    video.currentTime = selectedStart;

    video.play().catch((err) => {
      console.error("Video play error:", err);
    });

    const checkTime = () => {
      if (!videoRef.current) {
        return;
      }

      if (video.currentTime >= selectedEnd) {
        video.pause();
        video.currentTime = selectedStart;
        return;
      }

      if (!video.paused) {
        requestAnimationFrame(checkTime);
      }
    };

    requestAnimationFrame(checkTime);
  }

  function handleTimelineClick(event) {
    if (!videoDuration || !timelineRef.current) {
      return;
    }

    if (dragRef.current.active) {
      return;
    }

    const rect = timelineRef.current.getBoundingClientRect();

    const x = event.clientX - rect.left;

    const ratio = Math.max(0, Math.min(1, x / rect.width));

    const clickedTime = ratio * videoDuration;

    const newStart = clickedTime - CLIP_DURATION / 2;

    setClipStart(newStart);
  }

  function handleClipPointerDown(event) {
    if (!videoDuration) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = timelineRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const clipLeft = rect.left + (startTime / videoDuration) * rect.width;

    dragRef.current = {
      active: true,
      offsetX: event.clientX - clipLeft,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleClipPointerMove(event) {
    if (!dragRef.current.active) {
      return;
    }

    if (!timelineRef.current || !videoDuration) {
      return;
    }

    const rect = timelineRef.current.getBoundingClientRect();

    const offsetX = dragRef.current.offsetX;

    const newLeftPx = event.clientX - rect.left - offsetX;

    const secondsPerPixel = videoDuration / rect.width;

    let newStart = newLeftPx * secondsPerPixel;

    newStart = Math.max(0, newStart);
    newStart = Math.min(maxStart, newStart);

    setStartTime(newStart);
  }

  function handleClipPointerUp(event) {
    if (!dragRef.current.active) {
      return;
    }

    dragRef.current.active = false;

    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  async function handleAnalyze() {
    if (!videoFile) {
      setError("Please select a video first.");
      return;
    }

    if (!videoDuration || endTime <= startTime) {
      setError("Invalid clip selection.");
      return;
    }

    setError("");
    setProgress(0);
    setCurrentFrame(null);
    setFrameCount(0);

    try {
      setStatus("cutting");

      setStatusMessage(
        `Cutting ${(endTime - startTime).toFixed(2)} second clip...`,
      );

      const clipFile = await cutVideo(videoFile, startTime, endTime);

      setStatus("uploading");
      setStatusMessage("Uploading cut clip...");

      const formData = new FormData();

      formData.append("video", clipFile);

      formData.append("start_time", "0");

      formData.append("end_time", String(endTime - startTime));

      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = `Server error: ${response.status}`;

        try {
          const data = await response.json();

          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }

        throw new Error(message);
      }

      const data = await response.json();

      console.log("Analyze response:", data);

      const analysisId = data.analysis_id;

      if (!analysisId) {
        throw new Error("Server did not return analysis_id.");
      }

      setStatus("starting");
      setStatusMessage("Starting YOLO analysis...");

      connectWebSocket(analysisId);
    } catch (err) {
      console.error("Analysis error:", err);

      setStatus("error");
      setStatusMessage("Analysis failed");

      setError(err?.message || "Failed to analyze video.");
    }
  }

  function connectWebSocket(analysisId) {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsApiUrl = import.meta.env.VITE_API_URL;

    const WS_URL = wsApiUrl.replace(/^http/, "ws");

    const wsUrl = `${WS_URL}/api/analyze/${analysisId}/ws`;

    console.log("Connecting WebSocket:", wsUrl);

    const socket = new WebSocket(wsUrl);

    wsRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected");

      setStatus("analyzing");

      setStatusMessage("YOLO analysis started...");
    };

    socket.onmessage = (event) => {
      try {
        if (typeof event.data !== "string") {
          console.warn("Unexpected binary message:", event.data);

          return;
        }

        const message = JSON.parse(event.data);

        console.log("WS JSON message:", message);

        if (message.type === "frame") {
          const frameNumber = Number(message.frame ?? 0);

          const timestamp = Number(message.timestamp ?? 0);

          const frameProgress = Number(message.progress ?? 0);

          const detections = Array.isArray(message.detections)
            ? message.detections
            : [];

          if (!message.image) {
            console.warn("Frame received without image");

            return;
          }

          const imageUrl = message.image.startsWith("data:")
            ? message.image
            : `data:image/jpeg;base64,${message.image}`;

          setProgress(Math.max(0, Math.min(100, frameProgress)));

          setFrameCount(frameNumber);

          setStatus("analyzing");

          setStatusMessage("YOLO analysis running...");

          setCurrentFrame({
            frame: frameNumber,
            timestamp,
            progress: frameProgress,
            detections,
            width: Number(message.width || 1920),
            height: Number(message.height || 1080),
            imageUrl,
          });

          return;
        }

        if (message.type === "completed") {
          setProgress(100);

          setStatus("completed");

          if (message.scene_id) {
            setSceneId(Number(message.scene_id));
            console.log("Scene saved:", message.scene_id);
          } else {
            console.warn("Analysis completed, but scene was not saved.");
          }

          setStatusMessage("Analysis completed");

          console.log("Analysis completed:", message);

          return;
        }

        if (message.type === "error") {
          setStatus("error");

          setStatusMessage("Analysis failed");

          setError(message.message || "Unknown analysis error");
        }
      } catch (err) {
        console.error("Invalid WebSocket JSON:", err);
      }
    };

    socket.onerror = (event) => {
      console.error("WebSocket error:", event);

      setStatus("error");

      setStatusMessage("WebSocket error");

      setError("Could not receive YOLO frames from the backend.");
    };

    socket.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
    };
  }

  function resetAnalysis() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setCurrentFrame(null);
    setProgress(0);
    setFrameCount(0);

    setStatus(videoFile ? "ready" : "idle");

    setStatusMessage(videoFile ? "Video ready" : "");

    setError("");
  }

  const statusText = {
    idle: "Select a video",
    ready: "Ready",
    cutting: "Cutting clip...",
    uploading: "Uploading...",
    starting: "Starting YOLO...",
    analyzing: "YOLO analysis...",
    completed: "Analysis completed",
    error: "Error",
  };

  return (
    <div className="upload-page">
      <div className="upload-page__container">
        <h1 className="upload-page__title">
          Soccer Video to Tactical Scheme Converter
        </h1>

        <div className="upload-page__grid">
          <div className="upload-page__left">
            <div className="upload-page__panel upload-page__file">
              <input
                ref={fileInputRef}
                id="video-upload"
                className="upload-page__file-input"
                type="file"
                accept="video/mp4,video/*"
                onChange={handleFileChange}
              />

              <label
                htmlFor="video-upload"
                className="upload-page__file-button"
              >
                Choose video
              </label>

              {videoFile && (
                <span className="upload-page__file-name">
                  {videoFile.name}
                </span>
              )}
            </div>

            {videoUrl && (
              <div className="upload-page__panel upload-page__video-panel">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  className="upload-page__video"
                />

                <div
                  style={{
                    marginTop: "20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                      fontSize: "14px",
                      color: "#aaa",
                    }}
                  >
                    <span>Start: {formatTime(startTime)}</span>

                    <span>Selected: {formatTime(clipDuration)}</span>

                    <span>End: {formatTime(endTime)}</span>
                  </div>

                  <div
                    ref={timelineRef}
                    onClick={handleTimelineClick}
                    style={{
                      position: "relative",
                      height: "54px",
                      background: "#292929",
                      borderRadius: "8px",
                      cursor: "pointer",
                      userSelect: "none",
                      touchAction: "none",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "repeating-linear-gradient(90deg, transparent 0px, transparent 9.9%, rgba(255,255,255,0.04) 10%, rgba(255,255,255,0.04) calc(10% + 1px))",
                        pointerEvents: "none",
                      }}
                    />

                    {videoDuration > 0 && (
                      <div
                        onPointerDown={handleClipPointerDown}
                        onPointerMove={handleClipPointerMove}
                        onPointerUp={handleClipPointerUp}
                        onPointerCancel={handleClipPointerUp}
                        style={{
                          position: "absolute",
                          top: "4px",
                          bottom: "4px",
                          left: `${timelineStartPercent}%`,
                          width: `${timelineWidthPercent}%`,
                          background: "rgba(34,197,94,0.25)",
                          border: "2px solid #22c55e",
                          borderRadius: "7px",
                          boxSizing: "border-box",
                          cursor: "grab",
                          zIndex: 5,
                          touchAction: "none",
                          boxShadow: "0 0 12px rgba(34,197,94,0.25)",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: "-5px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "8px",
                            height: "30px",
                            background: "#22c55e",
                            borderRadius: "4px",
                            pointerEvents: "none",
                          }}
                        />

                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            color: "#fff",
                            fontSize: "12px",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            textShadow: "0 1px 3px #000",
                            pointerEvents: "none",
                          }}
                        >
                          1 SEC
                        </div>

                        <div
                          style={{
                            position: "absolute",
                            right: "-5px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "8px",
                            height: "30px",
                            background: "#22c55e",
                            borderRadius: "4px",
                            pointerEvents: "none",
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "8px",
                      color: "#777",
                      fontSize: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Video: {formatTime(videoDuration)}</span>

                    <span>Drag the green 1-second window</span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    background: "#202020",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: "8px",
                    }}
                  >
                    Selected scene
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                      color: "#bbb",
                      fontSize: "14px",
                    }}
                  >
                    <div>
                      Start
                      <br />
                      <strong
                        style={{
                          color: "#22c55e",
                        }}
                      >
                        {formatTime(startTime)}
                      </strong>
                    </div>

                    <div>
                      End
                      <br />
                      <strong
                        style={{
                          color: "#22c55e",
                        }}
                      >
                        {formatTime(endTime)}
                      </strong>
                    </div>

                    <div>
                      Duration
                      <br />
                      <strong
                        style={{
                          color: "#22c55e",
                        }}
                      >
                        {formatTime(clipDuration)}
                      </strong>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePlayClip}
                  disabled={!videoDuration}
                  style={{
                    marginTop: "16px",
                    marginLeft: "10px",
                    padding: "10px 16px",
                    cursor: videoDuration ? "pointer" : "not-allowed",
                    border: "none",
                    borderRadius: "6px",
                    background: "#333",
                    color: "#fff",
                  }}
                >
                  ▶ Play 1 second
                </button>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={
                    !videoFile ||
                    status === "cutting" ||
                    status === "uploading" ||
                    status === "starting" ||
                    status === "analyzing"
                  }
                  style={{
                    marginTop: "16px",
                    marginLeft: "10px",
                    padding: "10px 20px",
                    cursor: "pointer",
                    fontWeight: 700,
                    border: "none",
                    borderRadius: "6px",
                    background: "#22c55e",
                    color: "#000",
                  }}
                >
                  Analyze
                </button>

                {(status !== "idle" || statusMessage) && (
                  <div
                    style={{
                      marginTop: "20px",
                      padding: "12px",
                      background: "#202020",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: "8px",
                      }}
                    >
                      {statusText[status]}
                    </div>

                    {statusMessage && (
                      <div
                        style={{
                          color: "#aaa",
                          fontSize: "14px",
                        }}
                      >
                        {statusMessage}
                      </div>
                    )}
                  </div>
                )}

                {status === "cutting" && (
                  <div
                    style={{
                      marginTop: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                        fontSize: "13px",
                        color: "#aaa",
                      }}
                    >
                      <span>FFmpeg</span>

                      <span>{ffmpegProgress.toFixed(1)}%</span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        height: "10px",
                        background: "#303030",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${ffmpegProgress}%`,
                          height: "100%",
                          background: "#22c55e",
                          transition: "width 0.1s linear",
                        }}
                      />
                    </div>
                  </div>
                )}

                {(status === "analyzing" || status === "completed") && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "10px"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                        fontSize: "14px",
                      }}
                    >
                      <span>YOLO progress</span>

                      <span>{progress.toFixed(1)}%</span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        height: "14px",
                        background: "#303030",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${progress}%`,
                          height: "100%",
                          background:
                            "linear-gradient(90deg, #16a34a, #22c55e)",
                          transition: "width 0.15s linear",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: "8px",
                        color: "#aaa",
                        fontSize: "13px",
                      }}
                    >
                      Frame: {frameCount}
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px",
                      background: "#451a1a",
                      color: "#ff8a8a",
                      borderRadius: "8px",
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="upload-page__panel upload-page__yolo">
            <div className="upload-page__panel-header">YOLO frames</div>

            <FrameViewer frame={currentFrame} />

            {currentFrame && (
              <div className="upload-page__frame-info">
                Frame {currentFrame.frame}
                {" • "}
                {formatTime(currentFrame.timestamp)}
                {" • "}
                {currentFrame.detections?.length || 0} detections
              </div>
            )}
          </div>

          <div className="upload-page__panel upload-page__field">
            <div className="upload-page__panel-header">Tactical scheme</div>

            <TacticalScheme sceneId={sceneId} />
          </div>
        </div>
      </div>
    </div>
  );
}
