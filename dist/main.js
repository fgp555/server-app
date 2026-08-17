const express = require("express");
const morgan = require("morgan");
const mysql = require("mysql2/promise");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(express.static("./frontend/"));

console.log("test:", process.env.TEST_ENV);

// --- Conexion a la base de datos ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "my_db",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

// --- Cliente S3 ---
// No se pasan credenciales explicitas: el SDK las toma automaticamente
// del rol IAM de la instancia EC2 (via el Instance Metadata Service).
const BUCKET = process.env.S3_BUCKET;
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-2" });

// Multer guarda el archivo en memoria (buffer), nunca en disco local
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/db-ping", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT VERSION() AS version, NOW() AS server_time");
    res.status(200).json({ status: "ok index.js", db: rows[0] });
  } catch (err) {
    console.error("Error conectando a la DB:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- Subir un archivo: POST /upload, form-data con campo "file" ---
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "No se envio ningun archivo (campo 'file')" });
  }

  const key = `${Date.now()}-${req.file.originalname}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }),
    );
    res.status(201).json({ status: "ok", key, size: req.file.size });
  } catch (err) {
    console.error("Error subiendo a S3:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- Listar archivos ---
app.get("/files", async (req, res) => {
  try {
    const data = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }));
    const files = (data.Contents || []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }));
    res.status(200).json({ status: "ok", files });
  } catch (err) {
    console.error("Error listando S3:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- URL firmada temporal para ver/descargar un archivo (bucket privado) ---
app.get("/files/:key/url", async (req, res) => {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: req.params.key });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutos
    res.status(200).json({ status: "ok", url });
  } catch (err) {
    console.error("Error generando URL firmada:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- Eliminar un archivo ---
app.delete("/files/:key", async (req, res) => {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: req.params.key }));
    res.status(200).json({ status: "ok", deleted: req.params.key });
  } catch (err) {
    console.error("Error eliminando de S3:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
