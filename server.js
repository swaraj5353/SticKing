const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

/* =========================================================
   OPENAI
   ========================================================= */

const openaiConfigured = !!process.env.OPENAI_API_KEY;

console.log("==========================================");

if (openaiConfigured) {
  console.log("✅ OPENAI_API_KEY is configured.");
} else {
  console.log("❌ OPENAI_API_KEY is NOT configured.");
}

const openai = openaiConfigured
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;


/* =========================================================
   CORS
   ========================================================= */

app.use((req, res, next) => {

  const origin = req.headers.origin;

  const allowedOrigins = [
    "https://sticking.odoo.com",
    "https://www.sticking.odoo.com",
    "https://sticking.onrender.com"
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  if (req.method === "OPTIONS") {
    console.log("➡️ OPTIONS", req.path);

    return res.status(204).end();
  }

  next();
});


/* =========================================================
   BODY PARSING
   ========================================================= */

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);


/* =========================================================
   FILE UPLOAD
   ========================================================= */

const upload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: 50 * 1024 * 1024
  }

});


/* =========================================================
   REQUEST LOGGER
   ========================================================= */

app.use((req, res, next) => {

  console.log(
    `➡️ ${req.method} ${req.path}`
  );

  next();

});


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/health", (req, res) => {

  res.json({

    ok: true,

    service:
      "SticKing AI Vehicle Customizer",

    status:
      "running",

    openaiConfigured:
      openaiConfigured

  });

});


/* =========================================================
   HOME
   ========================================================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


/* =========================================================
   GENERATE VEHICLE PREVIEW
   ========================================================= */

app.post(

  "/generate-preview",

  upload.fields([

    {
      name: "vehicleImage",
      maxCount: 1
    },

    {
      name: "vehiclePhoto",
      maxCount: 1
    }

  ]),

  async (req, res) => {

    console.log("");
    console.log("==========================================");
    console.log("🚗 GENERATE PREVIEW REQUEST RECEIVED");
    console.log("==========================================");


    try {

      /* =====================================================
         CHECK OPENAI
         ===================================================== */

      if (!openaiConfigured || !openai) {

        console.log(
          "❌ OpenAI API key is missing."
        );

        return res.status(500).json({

          ok: false,

          error:
            "OpenAI API key is not configured on the server."

        });

      }


      /* =====================================================
         GET UPLOADED IMAGE
         Supports BOTH names:
         vehicleImage
         vehiclePhoto
         ===================================================== */

      let uploadedFile = null;

      if (
        req.files &&
        req.files.vehicleImage &&
        req.files.vehicleImage[0]
      ) {

        uploadedFile =
          req.files.vehicleImage[0];

      }

      if (
        !uploadedFile &&
        req.files &&
        req.files.vehiclePhoto &&
        req.files.vehiclePhoto[0]
      ) {

        uploadedFile =
          req.files.vehiclePhoto[0];

      }


      /* =====================================================
         CHECK IMAGE
         ===================================================== */

      if (!uploadedFile) {

        console.log(
          "❌ No vehicle image received."
        );

        return res.status(400).json({

          ok: false,

          error:
            "No vehicle image was uploaded."

        });

      }


      console.log(
        "📷 Image received:",
        uploadedFile.originalname
      );

      console.log(
        "📦 Image size:",
        uploadedFile.size,
        "bytes"
      );

      console.log(
        "🖼️ Image MIME type:",
        uploadedFile.mimetype
      );


      /* =====================================================
         FORM DATA
         ===================================================== */

      const design =
        req.body.design ||
        req.body.tattoo ||
        req.body.description ||
        "";

      const width =
        req.body.width ||
        req.body.widthCm ||
        "";

      const height =
        req.body.height ||
        req.body.heightCm ||
        "";

      const description =
        req.body.description ||
        req.body.instructions ||
        "";


      console.log(
        "🎨 Design:",
        design
      );

      console.log(
        "📏 Width:",
        width
      );

      console.log(
        "📐 Height:",
        height
      );

      console.log(
        "📝 Description:",
        description
      );


      /* =====================================================
         CREATE PROMPT
         ===================================================== */

      const prompt = `

You are a professional automotive vinyl wrap and vehicle sticker designer.

Create a highly realistic photographic preview of the uploaded vehicle with the requested decal, tattoo or sticker design applied to the vehicle.

IMPORTANT REQUIREMENTS:

1. Keep the original vehicle recognizable.

2. Do NOT replace the vehicle.

3. Do NOT change the vehicle model.

4. Do NOT change the vehicle body shape.

5. Do NOT redesign the vehicle.

6. Keep the original perspective and camera angle.

7. Keep the original wheels, windows, headlights, grille and body panels.

8. Apply the requested design naturally onto the selected vehicle surface.

9. Make the design look like professionally installed automotive vinyl.

10. The design must follow the curvature of the vehicle.

11. Preserve realistic reflections.

12. Preserve realistic shadows.

13. Preserve realistic lighting.

14. The decal must appear physically attached to the vehicle.

15. Do not make the sticker float beside the vehicle.

16. Do not create a separate sticker floating in the image.

17. Do not unnecessarily change the background.

18. Make the final result look like a real photograph of a customized vehicle.

19. Keep the vehicle proportions realistic.

20. Make the design clean, premium and commercially realistic.

REQUESTED DESIGN:

${design}

REQUESTED SIZE:

Width: ${width} cm
Height: ${height} cm

CUSTOMER INSTRUCTIONS:

${description}

Generate the final realistic vehicle customization preview.

`;


      console.log(
        "🧠 Prompt created."
      );


      /* =====================================================
         CONVERT BUFFER INTO REAL UPLOADABLE FILE
         ===================================================== */

      console.log(
        "📤 Preparing image for OpenAI..."
      );


      const imageFile = await toFile(

        uploadedFile.buffer,

        uploadedFile.originalname ||
          "vehicle.png",

        {
          type:
            uploadedFile.mimetype ||
            "image/png"
        }

      );


      console.log(
        "✅ Image converted to uploadable file."
      );


      /* =====================================================
         OPENAI IMAGE EDIT
         ===================================================== */

      console.log(
        "🤖 Sending image to OpenAI..."
      );


      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image:
            imageFile,

          prompt:
            prompt,

          size:
            "1024x1024"

        });


      console.log(
        "✅ OpenAI response received."
      );


      /* =====================================================
         CHECK RESPONSE
         ===================================================== */

      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0]
      ) {

        console.log(
          "❌ OpenAI returned no image."
        );

        return res.status(500).json({

          ok: false,

          error:
            "OpenAI did not return an image."

        });

      }


      const result =
        imageResponse.data[0];


      /* =====================================================
         BASE64 IMAGE
         ===================================================== */

      if (result.b64_json) {

        console.log(
          "🖼️ Base64 image received."
        );

        return res.json({

          ok: true,

          image:
            `data:image/png;base64,${result.b64_json}`

        });

      }


      /* =====================================================
         URL IMAGE
         ===================================================== */

      if (result.url) {

        console.log(
          "🔗 Image URL received."
        );

        return res.json({

          ok: true,

          image:
            result.url

        });

      }


      /* =====================================================
         UNKNOWN RESPONSE
         ===================================================== */

      console.log(
        "❌ OpenAI response contained no image."
      );

      return res.status(500).json({

        ok: false,

        error:
          "Unexpected OpenAI image response."

      });


    } catch (error) {

      console.log("");
      console.log("==========================================");
      console.log("❌ GENERATE PREVIEW FAILED");
      console.log("==========================================");

      console.error(
        "Error name:",
        error.name
      );

      console.error(
        "Error message:",
        error.message
      );

      console.error(
        "Error status:",
        error.status
      );

      console.error(
        "Error code:",
        error.code
      );

      console.error(
        "Full error:",
        error
      );


      /* =====================================================
         SEND REAL ERROR TO FRONTEND
         ===================================================== */

      return res.status(

        error.status || 500

      ).json({

        ok: false,

        error:
          error.message ||
          "Image generation failed."

      });

    }

  }

);


/* =========================================================
   404 HANDLER
   ========================================================= */

app.use((req, res) => {

  res.status(404).json({

    ok: false,

    error:
      "Route not found",

    path:
      req.path

  });

});


/* =========================================================
   GLOBAL ERROR HANDLER
   ========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "❌ GLOBAL SERVER ERROR"
    );

    console.error(
      error
    );

    res.status(500).json({

      ok: false,

      error:
        error.message ||
        "Server error"

    });

  }
);


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "=========================================="
    );

    console.log(
      "🚀 SticKing server started"
    );

    console.log(
      `🌐 http://0.0.0.0:${PORT}`
    );

    console.log(
      `🔑 OpenAI configured: ${openaiConfigured}`
    );

    console.log(
      "=========================================="
    );

  }
);
