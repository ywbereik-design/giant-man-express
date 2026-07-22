// Shared with AuthContext (in-app reads/writes) and the background location
// task (which runs outside the React tree and can't use useAuth/useContext,
// so it reads the persisted session directly).
export const SESSION_STORAGE_KEY = "giant-man-session";
