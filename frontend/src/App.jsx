import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import UploadPage from "./pages/UploadPage";
import ViewerPage from "./pages/ViewerPage";

import "./index.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
          path="/upload"
          element={<UploadPage />}
        />

        <Route
          path="/viewer"
          element={<ViewerPage />}
        />

        <Route
          path="/viewer/:sceneId"
          element={<ViewerPage />}
        />

        <Route
          path="/"
          element={
            <Navigate
              to="/upload"
              replace
            />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}