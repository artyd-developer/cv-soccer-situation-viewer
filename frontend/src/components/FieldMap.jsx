import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function PlayerPoint({ player }) {
  let backgroundColor = "#f97316"; // Unknown = orange

  if (player.team === "friend") {
    backgroundColor = "#22c55e"; // Teammate = green
  }

  if (player.team === "enemy") {
    backgroundColor = "#ef4444"; // Opponent = red
  }

  return (
    <div
      className="field-map__player"
      style={{
        left: `${player.x}%`,
        top: `${player.y}%`,
        backgroundColor,
      }}
      title={`Player ${player.id}`}
    >
      <span>{player.id}</span>
    </div>
  );
}

function BallPoint({ ball }) {
  return (
    <div
      className="field-map__ball"
      style={{
        left: `${ball.x}%`,
        top: `${ball.y}%`,
      }}
      title="Ball"
    >
      ⚽
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
}) {
  const objectIds =
    group.objects?.map(
      (object) => object.id,
    ) || [];

  return (
    <div
      style={{
        padding: "12px",
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

  const [groups, setGroups] = useState(
    [],
  );

  const [groupsLoading, setGroupsLoading] =
    useState(false);

  const [groupTeams, setGroupTeams] =
    useState({});

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

        // New scene starts with all groups as Unknown.
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


  const objects =
    scene?.objects || [];


  const imageWidth =
    Number(scene?.width) || 1920;

  const imageHeight =
    Number(scene?.height) || 1080;

  function convertX(x) {
    return Math.max(
      0,
      Math.min(
        100,
        (Number(x) / imageWidth) * 100,
      ),
    );
  }

  function convertY(y) {
    return Math.max(
      0,
      Math.min(
        100,
        (Number(y) / imageHeight) * 100,
      ),
    );
  }


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
        y: convertY(object.y),
        team: playerTeam,
      };
    });

  const balls = objects
    .filter(
      (object) =>
        object.type === "ball",
    )
    .map((object) => ({
      id: object.id,
      x: convertX(object.x),
      y: convertY(object.y),
    }));

  function handleGroupTeamChange(
    groupId,
    team,
  ) {
    setGroupTeams((current) => ({
      ...current,
      [groupId]: team,
    }));
  }

  function handleSimilarityChange(
    event,
  ) {
    const newSimilarity = Number(
      event.target.value,
    );

    setSimilarity(newSimilarity);

    // Reset all manual team selections.
    setGroupTeams({});
  }

  return (
    <div className="field-map">
      <div
        className="field-map__pitch"
        style={{
          position: "relative",
        }}
      >

        <div
          className="field-map__line field-map__line--outer"
        />

        <div
          className="field-map__line field-map__line--halfway"
        />

        <div className="field-map__center-circle" />

        <div className="field-map__center-point" />

        <div
          className="field-map__penalty-area field-map__penalty-area--left"
        />

        <div
          className="field-map__goal-area field-map__goal-area--left"
        />

        <div
          className="field-map__penalty-point field-map__penalty-point--left"
        />

        <div
          className="field-map__penalty-area field-map__penalty-area--right"
        />

        <div
          className="field-map__goal-area field-map__goal-area--right"
        />

        <div
          className="field-map__penalty-point field-map__penalty-point--right"
        />

        <div
          className="field-map__goal field-map__goal--left"
        />

        <div
          className="field-map__goal field-map__goal--right"
        />

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

        {!sceneId &&
          !loading && (
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
              Analyze a video to see the
              scene
            </div>
          )}

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

        {players.map((player) => (
          <PlayerPoint
            key={player.id}
            player={player}
          />
        ))}

        {balls.map((ball) => (
          <BallPoint
            key={ball.id}
            ball={ball}
          />
        ))}

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
              Color similarity
            </strong>

            <span
              style={{
                color: "#22c55e",
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
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {groups.map((group) => (
              <GroupItem
                key={group.group_id}
                group={group}
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
      </div>
    </div>
  );
}