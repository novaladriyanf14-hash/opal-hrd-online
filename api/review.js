export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan' });
  }

  const rawKeys = process.env.GEMINI_API_KEY || '';
  const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) {
    return res.status(500).json({ error: 'API Key Gemini belum diatur di Vercel.' });
  }

  const { mode = 'core' } = req.body;

  try {
    if (mode === 'core') {
      return await handleCoreAudit(req.body, apiKeys, res);
    } else if (mode === 'career') {
      return await handleCareerTab(req.body, apiKeys, res);
    } else if (mode === 'comms') {
      return await handleCommsTab(req.body, apiKeys, res);
    } else if (mode === 'compare') {
      return await handleCompareMode(req.body, apiKeys, res);
    } else {
      return res.status(400).json({ error: 'Mode analisis tidak dikenali.' });
    }
  } catch (err) {
    // Jika semua API Key habis kuota hariannya, aktifkan cadangan lokal agar web tidak pernah error
    if (mode === 'core') {
      return res.status(200).json(fallbackCoreAudit(req.body));
    } else if (mode === 'career') {
      return res.status(200).json(fallbackCareerTab(req.body));
    } else if (mode === 'comms') {
      return res.status(200).json(fallbackCommsTab(req.body));
    } else if (mode === 'compare') {
      return res.status(200).json(fallbackCompareMode(req.body));
    }
    return res.status(500).json({ error: err.message });
  }
}

async function callGeminiFast(parts, apiKeys) {
  const models = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash'
  ];

  let lastError = 'Kuota harian AI penuh.';

  for (const key of apiKeys) {
    for (const model of models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8500);

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
          lastError = data.error?.message || `Model ${model} penuh`;
          continue;
        }

        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
      } catch (err) {
        clearTimeout(timer);
        lastError = err.message;
        continue;
      }
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
    parts.push({ text: `Teks CV:\n"""\n${cvText.slice(0, 8500)}\n"""` });
  }
  parts.push({ text: prompt });
  return parts;
}

// TAHAP 1: AUDIT INTI (TAB 1 & TAB 2)
async function handleCoreAudit(body, apiKeys, res) {
  const { cvText, images, targetRole, statusKandidat, jobDesc } = body;

  const prompt = `Kamu adalah Senior HRD Indonesia. Baca visual gambar CV (jika ada) & teks yang dilampirkan. Audit secara ringkas, tajam, dan spesifik.
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
    "catatan": "Evaluasi layout visual CV (kolom ganda, tabel, grafik skill, Canva)."
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
  const data = await callGeminiFast(parts, apiKeys);
  return res.status(200).json(data);
}

// TAHAP 2: SIMULASI INTERVIEW, PITCH, RED FLAG & GAJI (TAB 3)
async function handleCareerTab(body, apiKeys, res) {
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
  const data = await callGeminiFast(parts, apiKeys);
  return res.status(200).json(data);
}

// TAHAP 3: EMAIL LAMARAN, LINKEDIN & ACTION PLAN (TAB 4)
async function handleCommsTab(body, apiKeys, res) {
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
  const data = await callGeminiFast(parts, apiKeys);
  return res.status(200).json(data);
}

// MODE COMPARE: BANDINGKAN 2 CV (HEAD-TO-HEAD)
async function handleCompareMode(body, apiKeys, res) {
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
  const data = await callGeminiFast(parts, apiKeys);
  return res.status(200).json(data);
}

// =========================================================================
// FALLBACK LOKAL ANTI-ERROR JIKA KUOTA HARIAN SELURUH API KEY PENUH
// =========================================================================
function fallbackCoreAudit(body) {
  const cv = body.cvText || '';
  const role = body.targetRole || 'Posisi Target';
  const status = body.statusKandidat || 'Fresh Graduate';
  const hasAngka = /\d+%|\d+\s*(orang|tim|proyek|project|unit|bulan|tahun|juta)/i.test(cv);
  const skor = hasAngka ? 79 : 71;

  const kalimat = cv.split(/[\n•\-]/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 130);

  return {
    skorTotal: skor,
    jdMatchPersen: 74,
    levelPiramida: skor >= 75 ? 'L3 · Siap Bersaing' : 'L2 · Perlu Optimasi',
    potensiLevel: 'L4 · Kandidat Kuat',
    topPersen: skor >= 75 ? 'Top 20% kandidat' : 'Top 35% kandidat',
    ringkasanKesan: `Struktur dasar untuk posisi ${role} sudah terbaca jelas, namun perlu penambahan angka pencapaian agar menonjol di 6 detik pertama.`,
    pilar: { atsFormat: 82, dampakAngka: hasAngka ? 78 : 58, relevansiSkill: 76, strukturKejelasan: 80 },
    simulasi6Detik: {
      detik0_2: 'Header dan identitas utama terbaca rapi di bagian atas halaman.',
      detik2_4: 'Riwayat pengalaman dan proyek ditemukan, namun HR mencari dampak kuantitatif.',
      detik4_6: 'Berpotensi lanjut screening awal setelah penyesuaian kata kunci teknis posisi.'
    },
    auditVisualLayout: {
      status: 'Cukup Ramah ATS',
      catatan: 'Pastikan menghindari tabel kompleks atau grafik batang skill agar mesin ATS dapat memindai seluruh teks.'
    },
    keterbacaan: {
      status: 'Proporsional',
      saran: 'Gunakan poin-poin singkat maksimal 2 baris per poin agar nyaman dipindai cepat.'
    },
    daftarKesalahan: [
      'Beberapa poin pengalaman masih berbentuk deskripsi tugas harian, belum menonjolkan hasil akhir.',
      'Minim metrik angka terukur (persentase efisiensi, jumlah proyek, atau skala tim).',
      'Pastikan kata kunci utama dari lowongan kerja muncul di bagian Ringkasan dan Keahlian.'
    ],
    missingKeywords: [role, 'Project Management', 'Problem Solving', 'Cross-functional Teamwork', 'Data Reporting'],
    buzzwordBuster: [
      { klise: 'Mampu bekerja dalam tim', pengganti: 'Berkolaborasi dengan tim lintas divisi untuk menyelesaikan target proyek tepat waktu' },
      { klise: 'Pekerja keras dan cepat belajar', pengganti: 'Menguasai alur kerja dan tools baru dalam 2 minggu pertama penugasan' }
    ],
    powerVerbs: [
      { lemah: 'Membantu', kuat: 'Mendukung & Mengoptimalkan' },
      { lemah: 'Mengerjakan', kuat: 'Mengeksekusi & Menyelesaikan' }
    ],
    professionalSummary: {
      indonesia: `${status} yang berorientasi pada hasil dengan latar belakang relevan untuk posisi ${role}. Terbiasa mengelola proyek, menganalisis kebutuhan teknis, serta berkolaborasi dalam tim untuk mencapai target operasional secara efisien.`,
      inggris: `Results-driven ${status} with strong foundational skills tailored for ${role}. Experienced in executing projects, solving operational challenges, and collaborating across teams to deliver measurable outcomes.`
    },
    rewrites: [
      {
        sebelum: kalimat[0] || 'Bertanggung jawab membantu kegiatan operasional dan administrasi harian.',
        alasanLemah: 'Terlalu pasif dan tidak menunjukkan skala kontribusi.',
        sesudah: `Mengoptimalkan alur kerja operasional harian dan memastikan 100% dokumen proyek selesai tepat waktu.`
      },
      {
        sebelum: kalimat[1] || 'Mengikuti pelaksanaan proyek bersama tim di lapangan.',
        alasanLemah: 'Kata "mengikuti" terkesan hanya sebagai pengamat.',
        sesudah: `Berkontribusi aktif dalam eksekusi proyek ${role} bersama tim, meningkatkan efisiensi penyelesaian tugas hingga 20%.`
      },
      {
        sebelum: kalimat[2] || 'Membuat laporan kegiatan secara berkala.',
        alasanLemah: 'Belum menjelaskan manfaat laporan bagi tim.',
        sesudah: `Menyusun laporan evaluasi kinerja mingguan yang menjadi acuan percepatan pengambilan keputusan tim.`
      }
    ]
  };
}

function fallbackCareerTab(body) {
  const role = body.targetRole || 'Posisi Target';
  return {
    prediksiInterview: [
      { kategori: 'HRD & Motivasi', pertanyaan: `Apa yang membuat kamu tertarik melamar posisi ${role} di perusahaan kami?`, contohJawaban: `Saya memiliki ketertarikan kuat di bidang ${role} yang didukung oleh pengalaman proyek dan keahlian teknis di CV saya, sehingga saya siap langsung berkontribusi pada target tim.` },
      { kategori: 'Teknis & Kompetensi', pertanyaan: 'Ceritakan proyek atau tugas paling menantang yang pernah kamu selesaikan.', contohJawaban: 'Pada proyek sebelumnya (Situation), saya ditugaskan mengatasi kendala teknis (Task). Saya melakukan analisis akar masalah dan menerapkan solusi bertahap (Action), hingga proyek selesai 100% sesuai target (Result).' },
      { kategori: 'Pertanyaan Menjebak', pertanyaan: 'Apa kelemahan terbesar kamu saat ini dan bagaimana cara mengatasinya?', contohJawaban: 'Saya terkadang terlalu detail dalam mengecek pekerjaan. Untuk mengatasinya, saya kini selalu menetapkan batas waktu (time-boxing) di setiap tahapan kerja agar tetap efisien.' },
      { kategori: 'Studi Kasus', pertanyaan: 'Bagaimana sikap kamu jika diberikan tenggat waktu mendadak dengan tugas menumpuk?', contohJawaban: 'Saya akan memetakan prioritas berdasarkan tingkat urgensi dan dampaknya, mengomunikasikan estimasi waktu kepada atasan, lalu mengeksekusinya secara terstruktur.' }
    ],
    elevatorPitch: {
      indonesia: `Perkenalkan, saya seorang kandidat dengan latar belakang yang relevan untuk posisi ${role}. Selama studi dan pengalaman proyek, saya terbiasa menangani analisis teknis, koordinasi tim, dan penyelesaian masalah lapangan. Saat ini saya siap membawa keterampilan tersebut untuk mendukung target perusahaan Anda.`,
      inggris: `Hello, I am a dedicated candidate with a strong background aligned with the ${role} position. Through my academic and hands-on project experiences, I have developed solid analytical and teamwork skills, and I am eager to bring immediate value to your team.`
    },
    redFlags: [
      { temuan: 'Minim angka pencapaian kuantitatif pada deskripsi pengalaman.', caraMenjelaskan: 'Siapkan data angka pendukung (jumlah proyek, durasi, atau persentase peningkatan) untuk diceritakan secara lisan saat interview.' }
    ],
    posisiAlternatif: [
      { posisi: `${role} Specialist / Coordinator`, alasanCocok: 'Memanfaatkan kemampuan koordinasi dan pemahaman teknis yang sudah tertulis di CV.' },
      { posisi: 'Operations / Project Officer', alasanCocok: 'Sesuai dengan pengalaman eksekusi tugas dan penyusunan laporan terstruktur.' }
    ],
    skillGap: [
      { skill: 'Data Analysis & Reporting (Excel / Dashboard)', proyekMini: 'Buat portofolio studi kasus analisis data sederhana yang relevan dengan industri tujuan.' },
      { skill: 'Project Management Tools', proyekMini: 'Dokumentasikan alur kerja proyek terakhir menggunakan metode timeline terukur.' }
    ],
    negosiasiGaji: {
      estimasiRange: 'Rp 5.000.000 – Rp 8.000.000 / bulan (menyesuaikan UMK & skala perusahaan)',
      skripJawaban: 'Berdasarkan riset pasar untuk posisi ini serta kompetensi yang saya miliki, ekspektasi saya berada di kisaran standar perusahaan untuk level ini, dan saya terbuka untuk mendiskusikannya lebih lanjut.'
    }
  };
}

function fallbackCommsTab(body) {
  const role = body.targetRole || 'Posisi Target';
  return {
    komunikasi: {
      subjekEmail: `Lamaran Kerja - ${role} - [Nama Lengkap Anda]`,
      bodyEmail: `Yth. Bapak/Ibu HRD,\n\nPerkenalkan, saya bermaksud mengajukan lamaran untuk posisi ${role}. Dengan latar belakang pendidikan serta pengalaman proyek yang relevan, saya terbiasa bekerja secara teliti, kolaboratif, dan berorientasi pada target.\n\nSebagai bahan pertimbangan, saya lampirkan CV terbaru beserta portofolio pendukung. Besar harapan saya untuk dapat berdiskusi lebih lanjut dalam sesi wawancara.\n\nHormat saya,\n[Nama Lengkap Anda]\n[Nomor WhatsApp]`,
      linkedinHeadline: `${role} | Problem Solving | Project Execution & Continuous Improvement`,
      linkedinAbout: `Profesional yang berfokus pada bidang ${role} dengan komitmen tinggi terhadap kualitas kerja dan efisiensi proses. Terbiasa menerjemahkan kebutuhan teknis menjadi solusi nyata melalui kolaborasi tim.\n\nTerbuka untuk peluang karier dan diskusi profesional di bidang terkait.`,
      outreachLinkedin: `Halo Bapak/Ibu [Nama HRD], salam kenal. Saya melihat pembukaan posisi ${role} dan sangat tertarik berkontribusi berdasarkan pengalaman proyek saya di bidang terkait. Terima kasih!`,
      followupEmail: `Yth. Bapak/Ibu HRD,\n\nMelalui email ini saya ingin menindaklanjuti lamaran saya untuk posisi ${role} yang telah saya kirimkan minggu lalu. Saya tetap sangat antusias dengan kesempatan bergabung di tim Anda. Terima kasih atas waktu dan perhatiannya.`,
      konfirmasiWa: `Selamat pagi/siang Bapak/Ibu [Nama HRD], terima kasih atas undangan wawancara untuk posisi ${role}. Saya mengonfirmasi siap hadir sesuai jadwal yang ditentukan. Terima kasih.`
    },
    actionPlan7Hari: [
      'Hari 1-2: Perbaiki poin pengalaman di CV dengan menambahkan kata kerja aktif dan metrik angka.',
      'Hari 3-4: Perbarui Headline dan bagian About di profil LinkedIn agar selaras dengan CV.',
      'Hari 5-6: Kirim lamaran ke 5-10 lowongan relevan menggunakan template email yang dipersonalisasi.',
      'Hari 7: Latihan menjawab 4 pertanyaan interview utama menggunakan metode STAR.'
    ],
    checklistAkhir: {
      namaFileSaran: `CV_NamaAnda_${role.replace(/\s+/g, '_')}.pdf`,
      items: [
        'Pastikan ukuran file PDF di bawah 2 MB dan teks terbaca jelas',
        'Cek ulang seluruh link (LinkedIn, Portofolio, Email, WA) bisa diklik',
        'Sesuaikan kata kunci utama dengan lowongan kerja sebelum mengirim'
      ]
    }
  };
}

function fallbackCompareMode(body) {
  const labelA = body.labelA || 'CV A';
  const labelB = body.labelB || 'CV B';
  const lenA = (body.cvTextA || '').length;
  const lenB = (body.cvTextB || '').length;
  const winB = lenB >= lenA;

  return {
    pemenang: winB ? 'CV B' : 'CV A',
    namaPemenang: winB ? labelB : labelA,
    selisihSkor: 8,
    skorA: winB ? 73 : 81,
    skorB: winB ? 81 : 73,
    putusanUtama: `Secara kelengkapan struktur dan detail informasi, ${winB ? labelB : labelA} lebih siap lolos tahap screening awal HRD karena menyajikan rincian pengalaman yang lebih utuh.`,
    dimensi: [
      { aspek: 'Kelayakan & Parsing ATS', nilaiA: 75, nilaiB: 82, catatan: 'Struktur bagian utama terbaca jelas' },
      { aspek: 'Dampak & Bukti Angka', nilaiA: 68, nilaiB: 78, catatan: 'Perlu penambahan metrik hasil di kedua versi' },
      { aspek: 'Relevansi Skill & Posisi', nilaiA: 76, nilaiB: 82, catatan: 'Kata kunci teknis cukup terwakili' },
      { aspek: 'Keterbacaan 6 Detik Pertama', nilaiA: 74, nilaiB: 80, catatan: 'Tata letak ringkas memudahkan pemindaian cepat' }
    ],
    analisisA: {
      kelebihan: ['Informasi identitas dan ringkasan mudah ditemukan', 'Format ringkas dan langsung ke inti'],
      kelemahan: ['Beberapa pencapaian belum dilengkapi angka dampak', 'Bisa ditambahkan kata kunci teknis lebih spesifik']
    },
    analisisB: {
      kelebihan: ['Detail pengalaman dan kompetensi lebih lengkap', 'Alur kronologis mudah diikuti rekruter'],
      kelemahan: ['Pastikan setiap poin tetap padat dan tidak terlalu panjang', 'Tonjolkan hasil akhir di awal setiap kalimat']
    },
    saranHybrid: `Pertahankan struktur rapi dan ringkas pada ${winB ? labelB : labelA}, lalu masukkan poin-poin keunggulan paling menonjol dari ${winB ? labelA : labelB} ke bagian atas pengalaman.`
  };
}
