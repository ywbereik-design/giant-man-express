import { fetch } from "expo/fetch";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiBaseUrl, REQUEST_TIMEOUT_MS } from "../api/client";

// Downloads a PDF from an authenticated backend route and opens the native
// share sheet so the admin can save it or send it straight to the accountant
// / a client by email, text, AirDrop, etc.
export async function downloadAndSharePdf(path: string, token: string, filename: string) {
  const url = `${apiBaseUrl()}${path}`;
  const destination = new Directory(Paths.cache, "giant-man-documents");
  destination.create({ intermediates: true, idempotent: true });

  // Was a bare fetch with no timeout — unlike every other network call in
  // the app (see api/client.ts), so a stalled connection left the "Share /
  // Save PDF" button spinning forever with no way out but killing the app.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The download timed out. Check your connection and try again.");
    }
    throw new Error("Could not reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Download failed (${response.status})`);

  const file = new File(destination, filename);
  if (file.exists) file.delete();
  file.write(await response.bytes());

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: filename });
  }
  return file.uri;
}
