import ImageAsset from "../components/ImageAsset";
import { api } from "../api/courses";
import { useEffect, useState } from "react";

import "../styles/GalleryPage.css";

const galleryStatus = {
  idle: "idle",
  loading: "loading",
  success: "success",
  error: "error",
};

export default function GalleryPage() {
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState(galleryStatus.idle);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGallery() {
      setStatus(galleryStatus.loading);

      try {
        const galleryImages = await api("/gallery", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setImages(galleryImages);
          setStatus(galleryStatus.success);
        }
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.error("Gallery load error:", error);
        setStatus(galleryStatus.error);
      }
    }

    loadGallery();

    return () => controller.abort();
  }, []);

  return (
    <section className="gallery-section bg-cream">
      <div className="container-lg">
        <h1>Ízelítő munkáimból</h1>
        <p className="subtitle">
          Amennyiben inkább a saját szemednek hiszel, akkor tekintsd meg
          legutóbbi munkáimat.
        </p>

        <div className="row g-4">
          {status === galleryStatus.loading && (
            <p className="text-center">Képek betöltése...</p>
          )}

          {status === galleryStatus.error && (
            <p className="text-center text-danger">
              Hiba történt a képek betöltésekor.
            </p>
          )}

          {status === galleryStatus.success && images.length === 0 && (
            <p className="text-center">Nincsenek képek a galériában.</p>
          )}

          {status === galleryStatus.success &&
            images.map((src) => (
              <div className="col-12 col-sm-6 col-md-4 col-lg-3" key={src}>
                <div className="gallery-item">
                  <ImageAsset src={src} alt="Galéria kép" loading="lazy" />
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
