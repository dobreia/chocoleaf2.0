const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

router.get("/", (req, res) => {
  const galleryDir = path.resolve(
    __dirname,
    "../../../frontend/public/assets/gallery",
  );

  fs.readdir(galleryDir, (err, files) => {
    if (err) {
      console.error("Gallery load error:", err);
      return res
        .status(500)
        .json({ error: "Nem sikerult beolvasni a kepeket." });
    }

    const images = files
      .filter((file) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => `/assets/gallery/${file}`);

    res.json(images);
  });
});

module.exports = router;
