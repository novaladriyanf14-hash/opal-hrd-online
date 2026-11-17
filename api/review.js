export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key Gemini belum diatur di Vercel.' });
  }

  const { mode = 'core' } = req.body;

  try {
    if (mode === 'core') {
      return await handleCoreAudit(req.body, apiKey, res);
    } else if (mode === 'career') {
      return await handleCareerTab(req.body, apiKey, res);
    } else if (mode === 'comms') {
      return await handleCommsTab(req.body, apiKey, res);
    } else if (mode === 'compare') {
      return await handleCompareMode(req.body, apiKey, res);
    } else {
      return res.status(400).json({ error: 'Mode analisis tidak dikenali.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server AI sedang sibuk, silakan coba klik ulang.' });
  }
}

async function callGeminiFast(parts, apiKey) {
  const models = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
  ];

  let lastError = 'Server AI sedang padat, silakan klik tombol analisis kembali.';

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2800,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      clearTimeout(timer);
      const data = await response.json();

      if (!response.ok) {
        lastError = data.error?.message || `Model ${model} sibuk`;
        continue;
      }

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      clearTimeout(timer);
      lastError = err.name === 'AbortError' ? 'Koneksi AI lambat, mencoba ulang...' : err.message;
      continue;
    }
  }

  throw new Error(lastError);
}

function buildVisualParts(images, cvText, prompt) {
  const parts = [];
  if (Array.isArray(images)) {
    images.slice(0, 2).forEach(b64 => {
      if (typeof b64 === 'string' && b64.length > 100) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    });
  }
  if (cvText && cvText.trim().length > 0) {
    parts.push({ text: `Ekstraksi Teks CV:\n"""\n${cvText.slice(0, 8000)}\n"""` });
  }
  parts.push({ text: prompt });
  return parts;
}

// TAHAP 1: AUDIT INTI (TAB 1 & TAB 2 — SUPER CEPAT 2-3 DETIK)
async function handleCoreAudit(body, apiKey, res) {
  const { cvText, images, targetRole, statusKandidat, jobDesc } = body;

  const prompt = `Kamu adalah Senior HRD Indonesia. Baca visual gambar CV (OCR) & teks yang dilampirkan. Audit secara ringkas, tajam, dan spesifik.
Posisi Target: ${targetRole || 'Sesuaikan isi CV'} | Status: ${statusKandidat || 'Fresh Graduate'}
Job Desc: ${jobDesc ? jobDesc.slice(0, 1500) : 'Standar industri Indonesia'}

Keluarkan HANYA JSON valid sesuai struktur persis ini:
{
  "skorTotal": 78,
  "jdMatchPersen": 75,
  "levelPiramida": "L3 · Siap Bersaing",
  "potensiLevel": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "1-2 kalimat reaksi jujur HRD di 3 detik pertama.",
  "pilar": { "atsFormat": 80, "dampakAngka": 65, "relevansiSkill": 78, "strukturKejelasan": 82 },
  "simulasi6Detik": {
    "detik0_2": "Reaksi HR scan header & kontak (1 kalimat).",
    "detik2_4": "Reaksi HR scan pengalaman & proyek (1 kalimat).",
    "detik4_6": "Keputusan akhir HR lanjut/skip & alasannya (1 kalimat)."
  },
  "auditVisualLayout": {
    "status": "Ramah ATS / Perlu Penyesuaian Layout",
    "catatan": "Evaluasi layout visual gambar CV (kolom ganda, tabel, grafik skill, Canva)."
  },
  "keterbacaan": {
    "status": "Ideal / Terlalu Padat / Terlalu Singkat",
    "saran": "Saran komposisi halaman & panjang kalimat."
  },
  "daftarKesalahan": ["Kesalahan spesifik 1", "Kesalahan spesifik 2", "Kesalahan spesifik 3"],
  "missingKeywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
  "buzzwordBuster": [
    { "klise": "Frasa klise/pasif di CV 1", "pengganti": "Bukti konkret berbasis hasil" },
    { "klise": "Frasa klise/pasif di CV 2", "pengganti": "Alternatif aktif ATS" }
  ],
  "powerVerbs": [
    { "lemah": "Kata kerja lemah 1", "kuat": "Kata kerja berdampak 1" },
    { "lemah": "Kata kerja lemah 2", "kuat": "Kata kerja berdampak 2" }
  ],
  "professionalSummary": {
    "indonesia": "Ringkasan profil 3 kalimat Bahasa Indonesia siap tempel di CV.",
    "inggris": "3-sentence Professional Summary in English tailored to this candidate."
  },
  "rewrites": [
    { "sebelum": "Kutipan kalimat asli 1 dari CV", "alasanLemah": "Kenapa kurang kuat", "sesudah": "Perbaikan dengan Action Verb + Angka" },
    { "sebelum": "Kutipan kalimat asli 2 dari CV", "alasanLemah": "Kenapa kurang kuat", "sesudah": "Perbaikan kalimat 2" },
    { "sebelum": "Kutipan kalimat asli 3 dari CV", "alasanLemah": "Kenapa kurang kuat", "sesudah": "Perbaikan kalimat 3" }
  ]
}`;

  const parts = buildVisualParts(images, cvText, prompt);
  const data = await callGeminiFast(parts, apiKey);
  return res.status(200).json(data);
}

// TAHAP 2: SIMULASI INTERVIEW, PITCH, RED FLAG & GAJI (TAB 3)
async function handleCareerTab(body, apiKey, res) {
  const { cvText, images, targetRole, statusKandidat } = body;

  const prompt = `Kamu adalah Career Coach & HRD Indonesia. Berdasarkan CV kandidat untuk posisi ${targetRole || 'Umum'} (${statusKandidat || 'Fresh Graduate'}), susun panduan interview & strategi karier dalam format JSON valid berikut:
{
  "prediksiInterview": [
    { "kategori": "HRD & Motivasi", "pertanyaan": "Pertanyaan spesifik 1 dari isi CV", "contohJawaban": "Contoh skrip jawaban metode STAR" },
    { "kategori": "Teknis & Kompetensi", "pertanyaan": "Pertanyaan teknis 2 sesuai skill/proyek CV", "contohJawaban": "Contoh skrip jawaban teknis" },
    { "kategori": "Pertanyaan Menjebak", "pertanyaan": "Pertanyaan menjebak 3 berdasarkan celah CV", "contohJawaban": "Contoh jawaban diplomatis" },
    { "kategori": "Studi Kasus", "pertanyaan": "Pertanyaan situasional 4 posisi incaran", "contohJawaban": "Contoh jawaban pemecahan masalah" }
  ],
  "elevatorPitch": {
    "indonesia": "Skrip perkenalan diri 45 detik Bahasa Indonesia yang mengalir natural.",
    "inggris": "45-second Elevator Pitch in natural English."
  },
  "redFlags": [
    { "temuan": "Potensi celah/red flag di CV", "caraMenjelaskan": "Cara elegan menjelaskannya ke HRD" }
  ],
  "posisiAlternatif": [
    { "posisi": "Jabatan Alternatif 1", "alasanCocok": "Alasan cocok dengan skill CV" },
    { "posisi": "Jabatan Alternatif 2", "alasanCocok": "Alasan cocok 2" }
  ],
  "skillGap": [
    { "skill": "Skill penting 1 yang belum ada di CV", "proyekMini": "Ide proyek mini 1 minggu untuk CV" },
    { "skill": "Skill penting 2", "proyekMini": "Ide proyek mini 2" }
  ],
  "negosiasiGaji": {
    "estimasiRange": "Kisaran gaji wajar di Indonesia untuk posisi & level ini",
    "skripJawaban": "Skrip kalimat aman saat ditanya ekspektasi gaji"
  }
}`;

  const parts = buildVisualParts(images, cvText, prompt);
  const data = await callGeminiFast(parts, apiKey);
  return res.status(200).json(data);
}

// TAHAP 3: EMAIL LAMARAN, LINKEDIN & ACTION PLAN (TAB 4)
async function handleCommsTab(body, apiKey, res) {
  const { cvText, images, targetRole } = body;

  const prompt = `Buatkan paket komunikasi lamaran kerja, optimasi LinkedIn, dan action plan 7 hari berdasarkan CV kandidat untuk posisi ${targetRole || 'Umum'}. Keluarkan HANYA JSON valid:
{
  "komunikasi": {
    "subjekEmail": "Subjek email lamaran profesional",
    "bodyEmail": "Body email lamaran siap kirim yang merangkum keunggulan CV",
    "linkedinHeadline": "Headline LinkedIn kaya kata kunci rekruter",
    "linkedinAbout": "Draft About LinkedIn 2 paragraf singkat",
    "outreachLinkedin": "Pesan singkat menyapa HRD di LinkedIn",
    "followupEmail": "Pesan follow-up setelah 7 hari melamar",
    "konfirmasiWa": "Template pesan WhatsApp membalas undangan interview"
  },
  "actionPlan7Hari": [
    "Hari 1-2: Perbaikan CV prioritas",
    "Hari 3-4: Optimasi LinkedIn & portofolio",
    "Hari 5-6: Strategi apply & networking",
    "Hari 7: Latihan interview"
  ],
  "checklistAkhir": {
    "namaFileSaran": "CV_NamaKandidat_Posisi.pdf",
    "items": [
      "Pastikan ukuran file PDF di bawah 2 MB dan teks terbaca jelas",
      "Cek ulang seluruh link (LinkedIn, Portofolio, Email, WA) bisa diklik",
      "Sesuaikan kata kunci utama dengan lowongan kerja sebelum mengirim"
    ]
  }
}`;

  const parts = buildVisualParts(images, cvText, prompt);
  const data = await callGeminiFast(parts, apiKey);
  return res.status(200).json(data);
}

// MODE COMPARE: BANDINGKAN 2 CV (HEAD-TO-HEAD)
async function handleCompareMode(body, apiKey, res) {
  const { cvTextA, imagesA, labelA, cvTextB, imagesB, labelB, targetRole } = body;

  const parts = [];
  if (Array.isArray(imagesA) && imagesA[0]) {
    parts.push({ text: `=== GAMBAR VISUAL CV A (${labelA}) ===` });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: imagesA[0] } });
  }
  if (Array.isArray(imagesB) && imagesB[0]) {
    parts.push({ text: `=== GAMBAR VISUAL CV B (${labelB}) ===` });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: imagesB[0] } });
  }

  const prompt = `Bandingkan secara objektif sebagai Panel HRD Indonesia antara CV A (${labelA}) dan CV B (${labelB}) untuk posisi ${targetRole || 'Target'}.
${cvTextA ? `Teks CV A:\n${cvTextA.slice(0, 4500)}\n` : ''}
${cvTextB ? `Teks CV B:\n${cvTextB.slice(0, 4500)}\n` : ''}

Keluarkan HANYA JSON valid:
{
  "pemenang": "CV A / CV B",
  "namaPemenang": "Label pemenang",
  "selisihSkor": 12,
  "skorA": 72,
  "skorB": 84,
  "putusanUtama": "2 kalimat keputusan tegas panel HRD mana yang dipilih interview duluan dan alasannya.",
  "dimensi": [
    { "aspek": "Kelayakan & Parsing ATS", "nilaiA": 70, "nilaiB": 88, "catatan": "Perbandingan singkat" },
    { "aspek": "Dampak & Bukti Angka", "nilaiA": 65, "nilaiB": 82, "catatan": "Perbandingan singkat" },
    { "aspek": "Relevansi Skill & Posisi", "nilaiA": 78, "nilaiB": 85, "catatan": "Perbandingan singkat" },
    { "aspek": "Keterbacaan 6 Detik Pertama", "nilaiA": 74, "nilaiB": 86, "catatan": "Perbandingan singkat" }
  ],
  "analisisA": { "kelebihan": ["Kelebihan A1", "Kelebihan A2"], "kelemahan": ["Kelemahan A1", "Kelemahan A2"] },
  "analisisB": { "kelebihan": ["Kelebihan B1", "Kelebihan B2"], "kelemahan": ["Kelemahan B1", "Kelemahan B2"] },
  "saranHybrid": "Saran menggabungkan elemen terbaik dari kedua CV."
}`;

  parts.push({ text: prompt });
  const data = await callGeminiFast(parts, apiKey);
  return res.status(200).json(data);
}
