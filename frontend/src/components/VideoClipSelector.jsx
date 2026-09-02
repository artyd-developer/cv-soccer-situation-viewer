import { useEffect, useRef, useState } from "react";

const CLIP_DURATION = 3;

export default function VideoClipSelector({
  onClipSelected,
}) {
  const videoRef = useRef(null);

  const [videoUrl, setVideoUrl] = useState(null);
  const [duration, setDuration] = useState(0);

  const [startTime, setStartTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }
    
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);

    setVideoUrl(url);
    setStartTime(0);
    setCurrentTime(0);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    setDuration(video.duration);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    setCurrentTime(video.currentTime);
  };

  const handleStartChange = (event) => {
    const value = Number(event.target.value);

    setStartTime(value);

    if (videoRef.current) {
      videoRef.current.currentTime = value;
    }
  };

  const playSelectedClip = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = startTime;
    video.play();
  };

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (
      currentTime >= startTime + CLIP_DURATION
    ) {
      video.pause();
      video.currentTime = startTime;
    }
  }, [currentTime, startTime]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const endTime = Math.min(
    startTime + CLIP_DURATION,
    duration
  );

  const maxStart = Math.max(
    0,
    duration - CLIP_DURATION
  );

  const handleAnalyze = () => {
    if (!videoUrl) {
      return;
    }

    onClipSelected?.({
      start: startTime,
      end: endTime,
      duration: CLIP_DURATION,
      videoUrl,
    });
  };

  return (
    <div className="video-clip-selector">

      {/* FILE */}

      <div className="video-file">

        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
        />

      </div>


      {/* VIDEO */}

      {videoUrl && (

        <>

          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={
              handleLoadedMetadata
            }
            onTimeUpdate={
              handleTimeUpdate
            }
            style={{
              width: "100%",
              maxWidth: "900px",
              display: "block",
              marginTop: "20px",
            }}
          />

          {/* TIMELINE */}

          <div
            className="timeline-container"
            style={{
              marginTop: "20px",
              maxWidth: "900px",
            }}
          >

            <div
              style={{
                position: "relative",
                height: "50px",
                background: "#222",
                borderRadius: "6px",
              }}
            >

              {/* 3 SECOND WINDOW */}

              {duration > 0 && (

                <div
                  style={{
                    position: "absolute",

                    left:
                      `${(startTime / duration) * 100}%`,

                    width:
                      `${(CLIP_DURATION / duration) * 100}%`,

                    height: "100%",

                    background:
                      "rgba(0, 255, 100, 0.35)",

                    border:
                      "2px solid #00ff66",

                    boxSizing: "border-box",

                    pointerEvents: "none",
                  }}
                />

              )}


              {/* CURRENT POSITION */}

              {duration > 0 && (

                <div
                  style={{
                    position: "absolute",

                    left:
                      `${(currentTime / duration) * 100}%`,

                    top: 0,

                    width: "2px",

                    height: "100%",

                    background: "#fff",

                    pointerEvents: "none",
                  }}
                />

              )}

              {/* SLIDER */}

              <input
                type="range"

                min="0"

                max={maxStart}

                step="0.01"

                value={startTime}

                onChange={
                  handleStartChange
                }

                style={{
                  position: "absolute",

                  left: 0,
                  top: 0,

                  width: "100%",
                  height: "100%",

                  opacity: 0,

                  cursor: "pointer",
                }}
              />

            </div>


            {/* TIME */}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "white",
                marginTop: "8px",
                fontFamily: "monospace",
              }}
            >

              <span>
                Start: {startTime.toFixed(2)}s
              </span>

              <span>
                End: {endTime.toFixed(2)}s
              </span>

              <span>
                Duration: {CLIP_DURATION.toFixed(2)}s
              </span>

            </div>


            {/* BUTTONS */}

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "15px",
              }}
            >

              <button
                onClick={playSelectedClip}
              >
                ▶ Play 3 seconds
              </button>


              <button
                onClick={handleAnalyze}
              >
                Analyze
              </button>

            </div>

          </div>

        </>

      )}

    </div>
  );
}