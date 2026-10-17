export const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API_URL + path, {
      credentials: "include",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      body:
        options.body instanceof Blob ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Nem sikerült kapcsolódni a szerverhez. Ellenőrizd az internetkapcsolatot.",
      {cause:error},
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin"))
      window.dispatchEvent(new Event("admin-session-expired"));
    throw new Error(data.message || data.error || "A művelet nem sikerült.");
  }
  return data;
}
export const getCourses = () => api("/courses");
export const getCourseAvailability = ({ courseId, year, month }) =>
  api(
    "/bookings/availability?" +
      new URLSearchParams(
        Object.entries({ courseId, year, month }).filter(([, v]) => v),
      ),
  );
export const createBooking = (data, key) =>
  api("/bookings", {
    method: "POST",
    body: data,
    headers: key ? { "Idempotency-Key": key } : {},
  });
export const createCourse = (body) =>
  api("/admin/courses", { method: "POST", body });
export const getAdminCourses = () => api("/admin/courses");
export const updateCourse = (id, body) =>
  api("/admin/courses/" + id, { method: "PUT", body });
export const deleteCourse = (id) =>
  api("/admin/courses/" + id, { method: "DELETE" });
export const getAdminCourseSlots = (id) =>
  api("/admin/courses/" + id + "/slots");
export const getAdminBookings = () => api("/admin/bookings");
export const updateBooking = (id, body) =>
  api("/admin/bookings/" + id, { method: "PATCH", body });
