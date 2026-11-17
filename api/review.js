export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key Gemini belum diatur di Environment Variables Vercel.' });
  }

  const { mode = 'single' } = req.body;

  try {
    if (mode === 'compare') {
      return await handleCompareMode(req.body, apiKey, res);
    } else {
      return await handleSingleMode(req.body, apiKey, res);
    }
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan sistem: ' + err.message });
  }
}

async function callGeminiWithFallback(parts, apiKey) {
  const daftarModel = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ];

  let lastError = 'Server AI sedang padat, silakan klik tombol analisis kembali dalam beberapa detik.';

  for (const model of daftarModel) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 6500,
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = data.error?.message || `Model ${model} sedang sibuk`;
        continue;
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(rawText);
    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  throw new Error(lastError);
}

async function handleSingleMode(body, apiKey, res) {
  const { cvText, pdfBase64, targetRole, statusKandidat, jobDesc } = body;

  if (!pdfBase64 && (!cvText || cvText.trim().length < 40)) {
    return res.status(400).json({ error: 'Silakan unggah file CV PDF atau tempel teks CV minimal 40 karakter.' });
  }

  const parts = [];

  if (pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64
      }
    });
  }

  const prompt = `Kamu adalah Senior HRD, Recruiter, dan Career Coach profesional di Indonesia. Lakukan audit komprehensif terhadap CV kandidat yang dilampirkan (baik dari file PDF visual/OCR maupun teks di bawah) dengan bahasa Indonesia yang tajam, empatik, konkret, dan langsung dapat dipraktikkan.

Konteks Kandidat:
- Posisi Target: ${targetRole || 'Sesuaikan dengan isi CV'}
- Status Kandidat: ${statusKandidat || 'Fresh Graduate'}
- Deskripsi Lowongan Kerja (Job Description): ${jobDesc ? jobDesc.slice(0, 3000) : 'Tidak dilampirkan (gunakan standar industri Indonesia untuk posisi target)'}
${cvText ? `- Ekstraksi Teks Tambahan:\n"""\n${cvText.slice(0, 10000)}\n"""` : ''}

Kembalikan HANYA JSON valid dengan struktur persis seperti berikut (isi semua field secara spesifik berdasarkan CV kandidat ini, jangan generik):
{
  "skorTotal": 78,
  "jdMatchPersen": 74,
  "levelPiramida": "L3 · Siap Bersaing",
  "potensiLevel": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "2 kalimat reaksi jujur HRD di 3 detik pertama melihat CV ini.",
  "pilar": {
    "atsFormat": 80,
    "dampakAngka": 65,
    "relevansiSkill": 78,
    "strukturKejelasan": 82
  },
  "simulasi6Detik": {
    "detik0_2": "Reaksi HR saat scan header, nama, kontak, dan ringkasan atas.",
    "detik2_4": "Reaksi HR saat memindai pengalaman kerja, magang, proyek, atau organisasi.",
    "detik4_6": "Keputusan akhir HRD (lanjut interview / masuk cadangan / skip) beserta alasan spesifiknya."
  },
  "auditVisualLayout": {
    "status": "Ramah ATS / Perlu Penyesuaian Layout",
    "catatan": "Evaluasi tata letak visual CV (kolom ganda, tabel, grafik skill, kepadatan halaman, font, atau elemen Canva yang berisiko di ATS)."
  },
  "keterbacaan": {
    "status": "Ideal / Terlalu Padat / Terlalu Singkat",
    "saran": "Analisis panjang kalimat, kepadatan teks, dan saran komposisi halaman."
  },
  "daftarKesalahan": [
    "Kesalahan spesifik 1 yang ditemukan langsung di CV kandidat",
    "Kesalahan spesifik 2 (misal typo, inkonsistensi tanggal, atau informasi kurang lengkap)",
    "Kesalahan spesifik 3",
    "Kesalahan spesifik 4"
  ],
  "missingKeywords": [
    "Keyword teknis / skill ATS 1",
    "Keyword 2",
    "Keyword 3",
    "Keyword 4",
    "Keyword 5",
    "Keyword 6"
  ],
  "buzzwordBuster": [
    {
      "klise": "Kata/frasa klise atau pasif yang ditemukan di CV (misal: pekerja keras / membantu)",
      "pengganti": "Kalimat pembuktian berbasis tindakan & hasil nyata"
    },
    {
      "klise": "Frasa klise/pasif 2 dari CV",
      "pengganti": "Alternatif aktif berstandar ATS"
    }
  ],
  "powerVerbs": [
    { "lemah": "Kata kerja lemah di CV 1", "kuat": "Kata kerja aktif berdampak 1" },
    { "lemah": "Kata kerja lemah di CV 2", "kuat": "Kata kerja aktif berdampak 2" },
    { "lemah": "Kata kerja lemah di CV 3", "kuat": "Kata kerja aktif berdampak 3" }
  ],
  "professionalSummary": {
    "indonesia": "Paragraf ringkasan profil (3-4 kalimat) versi Bahasa Indonesia yang siap tempel di bagian atas CV kandidat.",
    "inggris": "Professional Summary (3-4 sentences) in polished English tailored to the candidate's real background and target role."
  },
  "rewrites": [
    {
      "sebelum": "Kutipan kalimat asli 1 dari CV kandidat",
      "alasanLemah": "Penjelasan singkat kenapa kalimat ini kurang menjual di mata HRD",
      "sesudah": "Versi perbaikan dengan rumus Action Verb + Tugas + Metrik/Dampak"
    },
    {
      "sebelum": "Kutipan kalimat asli 2 dari CV kandidat",
      "alasanLemah": "Alasan kelemahan kalimat 2",
      "sesudah": "Versi perbaikan kalimat 2 yang tajam dan ramah ATS"
    },
    {
      "sebelum": "Kutipan kalimat asli 3 dari CV kandidat",
      "alasanLemah": "Alasan kelemahan kalimat 3",
      "sesudah": "Versi perbaikan kalimat 3"
    },
    {
      "sebelum": "Kutipan kalimat asli 4 dari CV kandidat",
      "alasanLemah": "Alasan kelemahan kalimat 4",
      "sesudah": "Versi perbaikan kalimat 4"
    }
  ],
  "redFlags": [
    {
      "temuan": "Potensi red flag / celah karir / ketidaksesuaian yang mungkin dipertanyakan HRD dari CV ini",
      "caraMenjelaskan": "Skrip jawaban diplomatis dan profesional jika ditanya HRD"
    }
  ],
  "posisiAlternatif": [
    {
      "posisi": "Nama Jabatan Alternatif 1",
      "alasanCocok": "Alasan kenapa pengalaman/skill di CV kandidat sangat cocok untuk posisi ini"
    },
    {
      "posisi": "Nama Jabatan Alternatif 2",
      "alasanCocok": "Alasan kecocokan 2"
    },
    {
      "posisi": "Nama Jabatan Alternatif 3",
      "alasanCocok": "Alasan kecocokan 3"
    }
  ],
  "skillGap": [
    {
      "skill": "Skill / Sertifikasi Penting 1 yang belum ada di CV",
      "proyekMini": "Ide proyek mini 1-2 minggu untuk membuktikan skill ini di CV"
    },
    {
      "skill": "Skill / Tools 2",
      "proyekMini": "Ide proyek mini praktis 2"
    },
    {
      "skill": "Skill / Tools 3",
      "proyekMini": "Ide proyek mini praktis 3"
    }
  ],
  "prediksiInterview": [
    {
      "kategori": "Pertanyaan HRD & Motivasi",
      "pertanyaan": "Pertanyaan interview spesifik 1 berdasarkan CV kandidat",
      "contohJawaban": "Skrip contoh jawaban ideal metode STAR yang memakai pengalaman nyata dari CV kandidat"
    },
    {
      "kategori": "Pertanyaan Teknis / Kompetensi",
      "pertanyaan": "Pertanyaan teknis spesifik 2 sesuai posisi & proyek di CV",
      "contohJawaban": "Skrip contoh jawaban teknis yang terstruktur"
    },
    {
      "kategori": "Pertanyaan Menjebak / Celah CV",
      "pertanyaan": "Pertanyaan menjebak 3 berdasarkan kelemahan/gap di CV",
      "contohJawaban": "Skrip contoh jawaban elegan untuk membalikkan kelemahan menjadi nilai tambah"
    },
    {
      "kategori": "Pertanyaan Studi Kasus",
      "pertanyaan": "Pertanyaan situasional 4 terkait tantangan di posisi incaran",
      "contohJawaban": "Skrip contoh jawaban berbasis pemecahan masalah"
    }
  ],
  "elevatorPitch": {
    "indonesia": "Skrip perkenalan diri 45-60 detik ('Ceritakan tentang diri Anda') versi Bahasa Indonesia yang mengalir natural.",
    "inggris": "45-60 second Elevator Pitch script in natural professional English."
  },
  "negosiasiGaji": {
    "estimasiRange": "Kisaran gaji wajar di Indonesia untuk level & posisi ini (misal: Rp 5.500.000 – Rp 7.500.000 / bulan)",
    "skripJawaban": "Contoh kalimat aman dan profesional saat HRD menanyakan ekspektasi gaji"
  },
  "komunikasi": {
    "subjekEmail": "Subjek email lamaran yang profesional",
    "bodyEmail": "Template body email lamaran siap kirim yang merangkum keunggulan CV kandidat",
    "linkedinHeadline": "Rekomendasi Headline LinkedIn kaya kata kunci rekruter",
    "linkedinAbout": "Draft bagian About LinkedIn (2 paragraf singkat) berbasis pengalaman kandidat",
    "outreachLinkedin": "Pesan singkat (maks 300 karakter) untuk connect & menyapa HRD di LinkedIn",
    "followupEmail": "Pesan follow-up sopan setelah 7 hari mengirim lamaran",
    "konfirmasiWa": "Template pesan WhatsApp profesional saat membalas undangan interview HRD"
  },
  "actionPlan7Hari": [
    "Hari 1-2: Langkah perbaikan CV prioritas utama",
    "Hari 3-4: Optimasi portofolio & profil LinkedIn",
    "Hari 5-6: Strategi melamar & networking rekruter",
    "Hari 7: Latihan simulasi interview & evaluasi"
  ],
  "checklistAkhir": {
    "namaFileSaran": "CV_NamaKandidat_PosisiTarget.pdf",
    "items": [
      "Item verifikasi spesifik 1 sesuai temuan di CV",
      "Pastikan format PDF bukan hasil screenshot pecah dan ukuran file di bawah 2 MB",
      "Cek ulang seluruh tautan (LinkedIn, Portofolio, Email, Nomor WhatsApp) aktif dan bisa diklik",
      "Sesuaikan kata kunci utama dengan lowongan kerja sebelum menekan tombol kirim"
    ]
  }
}`;

  parts.push({ text: prompt });
  const hasil = await callGeminiWithFallback(parts, apiKey);
  return res.status(200).json(hasil);
}

async function handleCompareMode(body, apiKey, res) {
  const { cvTextA, pdfBase64A, labelA, cvTextB, pdfBase64B, labelB, targetRole } = body;

  const adaA = pdfBase64A || (cvTextA && cvTextA.trim().length >= 40);
  const adaB = pdfBase64B || (cvTextB && cvTextB.trim().length >= 40);

  if (!adaA || !adaB) {
    return res.status(400).json({ error: 'Harap isi atau unggah kedua CV (CV A dan CV B) untuk dibandingkan.' });
  }

  const parts = [];

  if (pdfBase64A) {
    parts.push({ text: `=== DOKUMEN PDF UNTUK CV A (${labelA || 'CV A'}) ===` });
    parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfBase64A } });
  }
  if (pdfBase64B) {
    parts.push({ text: `=== DOKUMEN PDF UNTUK CV B (${labelB || 'CV B'}) ===` });
    parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfBase64B } });
  }

  const prompt = `Kamu adalah Panel Senior HRD Indonesia. Bandingkan secara objektif dan mendalam antara DUA CV berikut untuk posisi: ${targetRole || 'Posisi Target'}.

Label CV A: ${labelA || 'CV A'}
${cvTextA ? `Teks CV A:\n"""\n${cvTextA.slice(0, 7000)}\n"""` : ''}

Label CV B: ${labelB || 'CV B'}
${cvTextB ? `Teks CV B:\n"""\n${cvTextB.slice(0, 7000)}\n"""` : ''}

Berikan keputusan perbandingan Head-to-Head HANYA dalam format JSON valid berikut:
{
  "pemenang": "CV A / CV B",
  "namaPemenang": "${labelA || 'CV A'} atau ${labelB || 'CV B'}",
  "selisihSkor": 12,
  "skorA": 72,
  "skorB": 84,
  "putusanUtama": "2-3 kalimat keputusan tegas panel HRD mengenai CV mana yang dipanggil interview terlebih dahulu dan mengapa.",
  "dimensi": [
    { "aspek": "Kelayakan & Parsing ATS", "nilaiA": 70, "nilaiB": 88, "catatan": "Perbandingan singkat" },
    { "aspek": "Dampak & Bukti Angka", "nilaiA": 65, "nilaiB": 82, "catatan": "Perbandingan singkat" },
    { "aspek": "Relevansi Skill & Posisi", "nilaiA": 78, "nilaiB": 85, "catatan": "Perbandingan singkat" },
    { "aspek": "Keterbacaan 6 Detik Pertama", "nilaiA": 74, "nilaiB": 86, "catatan": "Perbandingan singkat" },
    { "aspek": "Kesiapan Lolos Screening HRD", "nilaiA": 73, "nilaiB": 80, "catatan": "Perbandingan singkat" }
  ],
  "analisisA": {
    "kelebihan": ["Kelebihan CV A 1", "Kelebihan CV A 2"],
    "kelemahan": ["Kelemahan CV A 1", "Kelemahan CV A 2"]
  },
  "analisisB": {
    "kelebihan": ["Kelebihan CV B 1", "Kelebihan CV B 2"],
    "kelemahan": ["Kelemahan CV B 1", "Kelemahan CV B 2"]
  },
  "saranHybrid": "Saran strategis bagaimana menggabungkan elemen terbaik dari CV A dan CV B agar tercipta 1 CV sempurna."
}`;

  parts.push({ text: prompt });
  const hasil = await callGeminiWithFallback(parts, apiKey);
  return res.status(200).json(hasil);
}
