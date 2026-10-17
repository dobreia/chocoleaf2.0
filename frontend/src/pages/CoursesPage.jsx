import ImageAsset from "../components/ImageAsset";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCourses } from "../api/courses";
import "../styles/CoursesPage.css";

function formatDuration(course) {
  if (course.duration_minutes) return `${course.duration_minutes} perc`;
  if (course.durationText) return course.durationText;
  if (course.durationHour) return `${course.durationHour} óra`;

  if (course.start_time && course.end_time) {
    const start = new Date(course.start_time);
    const end = new Date(course.end_time);
    const diffInHours = Math.round((end - start) / (1000 * 60 * 60));

    if (diffInHours > 0) return `${diffInHours} óra`;
  }

  return "";
}

function formatPrice(course) {
  const price = course.price ?? course.priceHUF;

  if (!Number.isFinite(Number(price))) return "";

  return `${Number(price).toLocaleString("hu-HU")} Ft`;
}

function getImageSrc(course) {
  const image = course.image !== undefined ? course.image : course.imageIndex || "";

  if (!image) return "/assets/courses/alap.jpg";
  if (image.startsWith("demo-media:") || image.startsWith("http") || image.startsWith("/")) return image;

  return `/${image}`;
}

function getDetailsPath(course) {
  const id = course.id || course.slug;

  return id ? `/courses/${encodeURIComponent(id)}` : "/courses";
}

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCourses()
      .then(setCourses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <h2 className="courses-status">Betöltés...</h2>;

  if (error) return <h2 className="courses-status">{error}</h2>;

  return (
    <div className="courses-page">
      <h1 className="courses-title">Képzések és workshopok</h1>
      {courses.length === 0 && (
        <p className="courses-status">Jelenleg nincs aktív képzés.</p>
      )}
      <section className="courses-grid" aria-label="Mostani képzések">
        {courses.map((course) => {
          const detailsPath = getDetailsPath(course);

          return (
            <article
              className="course-card"
              key={course.id || course.slug || course.title}
            >
              <ImageAsset
                className="course-card__image"
                src={getImageSrc(course)}
                alt={course.title}
              />

              <div className="course-card__content">
                <h2>{course.title}</h2>
                <p className="course-card__description">{course.description}</p>
              </div>

              <div className="course-card__meta">
                <p className="course-card__duration">
                  {formatDuration(course)}
                </p>
                {course.level && (
                  <p className="course-card__level">{course.level}</p>
                )}
                <p className="course-card__price">{formatPrice(course)}</p>
              </div>

              <Link className="course-card__button" to={detailsPath}>
                Részletek
              </Link>

              <Link
                className="course-card__button course-card__button--booking"
                to={`${detailsPath}/book`}
              >
                Foglalás
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
