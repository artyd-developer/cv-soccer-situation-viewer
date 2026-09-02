import Player from "./Player";

export default function Players({
  players,
  color,
  renderMode,
}) {
  return (
    <>
      {players.map((player) => (
        <Player
          key={player.id}
          player={player}
          color={color}
          renderMode={renderMode}
        />
      ))}
    </>
  );
}