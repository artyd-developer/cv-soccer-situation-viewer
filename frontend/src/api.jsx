const API_URL = import.meta.env.VITE_API_URL;

export async function getScenes() {
  const response = await fetch(
    `${API_URL}/api/scenes`
  );

  if (!response.ok) {
    throw new Error("Failed to load scenes");
  }

  return response.json();
}

export async function getSceneFrames(sceneId) {
  const response = await fetch(
    `${API_URL}/api/scenes/${sceneId}/frames`
  );

  if (!response.ok) {
    throw new Error("Failed to load scene frames");
  }

  return response.json();
}

export async function getViewerScenes() {
  const response = await fetch(
    `${API_URL}/api/viewer/scenes`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load scenes: ${response.status}`
    );
  }

  return response.json();
}


export async function getViewerScene(sceneId) {
  const response = await fetch(
    `${API_URL}/api/viewer/scenes/${sceneId}`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load scene: ${response.status}`
    );
  }

  return response.json();
}

