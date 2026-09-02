import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
const API_URL = import.meta.env.VITE_API_URL;

/*
 * Movement direction arrow.
 *
 * direction_angle comes from the database in radians.
 *
 * Our backend angle:
 *
 *   0       = +Z
 *   +PI/2   = +X
 *   -PI/2   = -X
 *   PI      = -Z
 *
 * The tactical scheme uses:
 *
 *   X -> screen right
 *   Z -> screen down
 *
 * Therefore the CSS rotation needs to be inverted.
 */
function DirectionArrow({
  directionAngle,
  color = "#ffffff",
}) {
  const angle = Number(directionAngle);

  if (!Number.isFinite(angle)) {
    return null;
  }

  const angleDegrees =
    (angle * 180) / Math.PI;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "3px",
        height: "30px",
        background: color,
        transformOrigin: "50% 0%",
        transform: `translateX(-50%) rotate(${-angleDegrees}deg)`,
        pointerEvents: "none",
        zIndex: 2,
        borderRadius: "2px",
        boxShadow:
          "0 0 3px rgba(0,0,0,0.8)",
      }}
    >
      {/* Arrow head */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "-1px",
          width: "8px",
          height: "8px",
          borderRight: `3px solid ${color}`,
          borderBottom: `3px solid ${color}`,
          transform:
            "translateX(-50%) rotate(45deg)",
          transformOrigin: "center",
        }}
      />
    </div>
  );
}

function PlayerPoint({ player }) {
  let backgroundColor = "#888";

  if (player.team === "friend") {
    backgroundColor = "#22c55e";
  }

  if (player.team === "enemy") {
    backgroundColor = "#ef4444";
  }

  return (
    <div
      className="field-map__player"
      style={{
        position: "absolute",
        left: `${player.x}%`,
        top: `${player.y}%`,
        backgroundColor,
        zIndex: 5,
      }}
      title={`Player ${player.id}`}
    >
      <span>{player.id}</span>

      <DirectionArrow
        directionAngle={
          player.direction_angle
        }
        color={backgroundColor}
      />
    </div>
  );
}

function BallPoint({ ball }) {
  return (
    <div
      className="field-map__ball"
      style={{
        position: "absolute",
        left: `${ball.x}%`,
        top: `${ball.y}%`,
        zIndex: 5,
      }}
      title="Ball"
    >
      <span
        style={{
          position: "relative",
          zIndex: 3,
        }}
      >
        ⚽
      </span>

      <DirectionArrow
        directionAngle={
          ball.direction_angle
        }
        color="#ffffff"
      />
    </div>
  );
}

function GroupColor({ colorVector }) {
  if (
    !Array.isArray(colorVector) ||
    colorVector.length === 0
  ) {
    return (
      <div
        style={{
          color: "#777",
          fontSize: "12px",
        }}
      >
        No color data
      </div>
    );
  }

  const values = colorVector.map(
    (value) => Number(value) || 0,
  );

  const maxValue = Math.max(
    ...values,
    0.0001,
  );

  const size = Math.floor(
    values.length / 3,
  );

  const colors = [];

  for (let i = 0; i < size; i++) {
    const r =
      (values[i] / maxValue) * 255;

    const g =
      (values[size + i] / maxValue) * 255;

    const b =
      (values[size * 2 + i] / maxValue) *
      255;

    colors.push(
      `rgb(${Math.round(r)}, ${Math.round(
        g,
      )}, ${Math.round(b)})`,
    );
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "28px",
        borderRadius: "5px",
        overflow: "hidden",
        background: "#111",
      }}
      title="Color vector"
    >
      {colors.map((color, index) => (
        <div
          key={index}
          style={{
            flex: 1,
            background: color,
          }}
        />
      ))}
    </div>
  );
}

function GroupItem({
  group,
  team,
  onTeamChange,
  index,
}) {
  const objectIds =
    group.objects?.map(
      (object) => object.id,
    ) || [];

  return (
    <div
      style={{
        padding: "6px",
        background: "#202020",
        borderRadius: "8px",
        border: "1px solid #303030",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          gap: "12px",
        }}
      >
        <strong>
          Group {String.fromCharCode(65 + index)}
        </strong>

        <span
          style={{
            color: "#888",
            fontSize: "12px",
          }}
        >
          {objectIds.length} objects
        </span>
      </div>

      <GroupColor
        colorVector={group.color_vector}
      />

      <div
        style={{
          marginTop: "8px",
          color: "#aaa",
          fontSize: "12px",
        }}
      >
        Objects:{" "}
        {objectIds.join(", ") || "—"}
      </div>

      <div
        style={{
          display: "flex",
          gap: "6px",
          marginTop: "10px",
          flexWrap: "wrap",
        }}
      >
        {/* Teammate */}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          <input
            type="radio"
            name={`group-${group.group_id}`}
            value="teammate"
            checked={team === "teammate"}
            onChange={() =>
              onTeamChange(
                group.group_id,
                "teammate",
              )
            }
          />

          Teammate
        </label>

        {/* Opponent */}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          <input
            type="radio"
            name={`group-${group.group_id}`}
            value="opponent"
            checked={team === "opponent"}
            onChange={() =>
              onTeamChange(
                group.group_id,
                "opponent",
              )
            }
          />

          Opponent
        </label>

        {/* Unknown */}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          <input
            type="radio"
            name={`group-${group.group_id}`}
            value="unknown"
            checked={team === "unknown"}
            onChange={() =>
              onTeamChange(
                group.group_id,
                "unknown",
              )
            }
          />

          Unknown
        </label>
      </div>
    </div>
  );
}

export default function FieldMap({
  sceneId,
}) {
  const [scene, setScene] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [similarity, setSimilarity] =
    useState(70);

  const [groups, setGroups] = useState([]);

  const [groupsLoading, setGroupsLoading] =
    useState(false);

  const [groupTeams, setGroupTeams] =
    useState({});

  const navigate = useNavigate();
  
  /*
   * Load scene.
   */

  useEffect(() => {
    if (!sceneId) {
      setScene(null);
      setGroups([]);
      setGroupTeams({});
      setError("");
      return;
    }

    let cancelled = false;

    async function loadScene() {
      try {
        setLoading(true);
        setError("");

        setGroupTeams({});

        console.log(
          "Loading scene:",
          sceneId,
        );

        const response = await fetch(
          `${API_URL}/api/scenes/${sceneId}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load scene: ${response.status}`,
          );
        }

        const data =
          await response.json();

        console.log(
          "Scene loaded:",
          data,
        );

        if (!cancelled) {
          setScene(data);
        }
      } catch (err) {
        console.error(
          "Failed to load scene:",
          err,
        );

        if (!cancelled) {
          setScene(null);

          setError(
            err?.message ||
              "Failed to load scene",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadScene();

    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  /*
   * Load groups whenever scene or
   * similarity changes.
   */

  useEffect(() => {
    if (!sceneId) {
      setGroups([]);
      return;
    }

    let cancelled = false;

    async function loadGroups() {
      try {
        setGroupsLoading(true);

        const response = await fetch(
          `${API_URL}/api/scenes/${sceneId}/groups?similarity=${similarity}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load groups: ${response.status}`,
          );
        }

        const data =
          await response.json();

        console.log(
          "Groups loaded:",
          data,
        );

        if (!cancelled) {
          setGroups(
            Array.isArray(data.groups)
              ? data.groups
              : [],
          );
        }
      } catch (err) {
        console.error(
          "Failed to load groups:",
          err,
        );

        if (!cancelled) {
          setGroups([]);
        }
      } finally {
        if (!cancelled) {
          setGroupsLoading(false);
        }
      }
    }

    loadGroups();

    return () => {
      cancelled = true;
    };
  }, [sceneId, similarity]);

  /*
   * Objects saved in database.
   */

  const objects =
    scene?.objects || [];

  /*
   * Image dimensions.
   */

  const imageWidth =
    Number(scene?.width) || 1920;

  const imageHeight =
    Number(scene?.height) || 1080;

  /*
   * Tactical scheme center.
   */

  const playerObjects = objects.filter(
    (object) =>
      object.type !== "ball" &&
      Number.isFinite(Number(object.x)) &&
      Number.isFinite(Number(object.z)),
  );

  const centerX =
    playerObjects.length > 0
      ? playerObjects.reduce(
          (sum, object) =>
            sum + Number(object.x),
          0,
        ) / playerObjects.length
      : imageWidth / 2;

  const centerY =
    playerObjects.length > 0
      ? playerObjects.reduce(
          (sum, object) =>
            sum + Number(object.z),
          0,
        ) / playerObjects.length
      : imageHeight / 2;

  /*
   * Convert coordinates to tactical scheme.
   */

  function convertX(x) {
    const normalized =
      Number(x) - centerX;

    return Math.max(
      0,
      Math.min(
        100,
        50 +
          (normalized / imageWidth) * 100,
      ),
    );
  }

  function convertY(y) {
    const normalized =
      Number(y) - centerY;

    return Math.max(
      0,
      Math.min(
        100,
        50 +
          (normalized / imageHeight) * 100,
      ),
    );
  }

  /*
   * Convert group selections into
   * object -> team mapping.
   */

  const objectTeams = {};

  groups.forEach((group) => {
    const team =
      groupTeams[group.group_id] ||
      "unknown";

    (group.objects || []).forEach(
      (object) => {
        objectTeams[object.id] = team;
      },
    );
  });

  /*
   * Players.
   */

  const players = objects
    .filter(
      (object) =>
        object.type !== "ball",
    )
    .map((object) => {
      const team =
        objectTeams[object.id] ||
        "unknown";

      let playerTeam = "unknown";

      if (team === "teammate") {
        playerTeam = "friend";
      }

      if (team === "opponent") {
        playerTeam = "enemy";
      }

      return {
        id: object.id,
        x: convertX(object.x),
        y: convertY(object.z),
        team: playerTeam,
        direction_angle:
          object.direction_angle,
      };
    });

  /*
   * Balls.
   */

  const balls = objects
    .filter(
      (object) =>
        object.type === "ball",
    )
    .map((object) => ({
      id: object.id,
      x: convertX(object.x),
      y: convertY(object.z),
      direction_angle:
        object.direction_angle,
    }));

  /*
   * Radio button handler.
   */

  function handleGroupTeamChange(
    groupId,
    team,
  ) {
    setGroupTeams((current) => ({
      ...current,
      [groupId]: team,
    }));
  }

  /*
   * Similarity slider handler.
   */

  function handleSimilarityChange(
    event,
  ) {
    const newSimilarity = Number(
      event.target.value,
    );

    setSimilarity(newSimilarity);

    setGroupTeams({});
  }

  /*
   * Save scheme.
   */

  async function handleSaveScheme() {
    if (!sceneId) {
      return;
    }

    try {
      setError("");

      const response = await fetch(
        `${API_URL}/api/scenes/${sceneId}/scheme`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            object_teams: objectTeams,
            accepted: true
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();

        throw new Error(
          data?.detail ||
            `Failed to save scheme: ${response.status}`,
        );
      }

      const data = await response.json();

      console.log(
        "Scheme saved:",
        data,
      );
      navigate(`/viewer/${sceneId}`);
    } catch (err) {
      console.error(
        "Failed to save scheme:",
        err,
      );

      setError(
        err?.message ||
          "Failed to save scheme",
      );
    }
  }

  return (
    <div className="field-map">
      <div
        className="field-map__pitch"
        style={{
          position: "relative",
        }}
      >
        {/* Outer field */}

        <div
          className="field-map__line field-map__line--outer"
        />

        {/* Loading */}

        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#aaa",
              background:
                "rgba(0, 0, 0, 0.25)",
              zIndex: 50,
            }}
          >
            Loading scene...
          </div>
        )}

        {/* No scene */}

        {!sceneId &&
          !loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                zIndex: 10,
              }}
            >
              Analyze a video to see the
              scene
            </div>
          )}

        {/* Scene loaded but no objects */}

        {sceneId &&
          !loading &&
          scene &&
          objects.length === 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#777",
                zIndex: 10,
              }}
            >
              No objects detected
            </div>
          )}

        {/* Players */}

        {players.map((player) => (
          <PlayerPoint
            key={player.id}
            player={player}
          />
        ))}

        {/* Balls */}

        {balls.map((ball) => (
          <BallPoint
            key={ball.id}
            ball={ball}
          />
        ))}

        {/* Error */}

        {error && (
          <div
            style={{
              position: "absolute",
              left: "10px",
              right: "10px",
              bottom: "10px",
              padding: "10px",
              background: "#451a1a",
              color: "#ff8a8a",
              borderRadius: "6px",
              zIndex: 100,
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Legend */}

      <div className="field-map__legend">
        <div className="field-map__legend-item">
          <span className="field-map__legend-dot field-map__legend-dot--friend" />

          <span>
            Teammates
          </span>
        </div>

        <div className="field-map__legend-item">
          <span className="field-map__legend-dot field-map__legend-dot--enemy" />

          <span>
            Opponents
          </span>
        </div>

        <div className="field-map__legend-item">
          <span className="field-map__legend-dot field-map__legend-dot--unknown" />

          <span>
            Unknown
          </span>
        </div>

        <div className="field-map__legend-item">
          <span className="field-map__legend-ball">
            ⚽
          </span>

          <span>
            Ball
          </span>
        </div>

        <button
          type="button"
          onClick={handleSaveScheme}
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
          Save Scheme
        </button>
      </div>

      {/* Similarity */}

      {sceneId && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            background: "#202020",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <strong>
              Color vector diversity
            </strong>

            <span
              style={{
                color: "#ffffffff",
                fontWeight: 700,
              }}
            >
              {similarity}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={similarity}
            onChange={
              handleSimilarityChange
            }
            style={{
              width: "100%",
              cursor: "pointer",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              marginTop: "4px",
              color: "#777",
              fontSize: "11px",
            }}
          >
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Groups */}

      {sceneId && (
        <div
          style={{
            marginTop: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <strong>
              Groups
            </strong>

            {groupsLoading && (
              <span
                style={{
                  color: "#777",
                  fontSize: "12px",
                }}
              >
                Loading...
              </span>
            )}
          </div>

          {groups.length === 0 &&
            !groupsLoading && (
              <div
                style={{
                  padding: "12px",
                  color: "#777",
                  background: "#202020",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                No groups found
              </div>
            )}

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {groups.map((group, index) => (
              <GroupItem
                key={group.group_id}
                group={group}
                index={index}
                team={
                  groupTeams[
                    group.group_id
                  ] || "unknown"
                }
                onTeamChange={
                  handleGroupTeamChange
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}