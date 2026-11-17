export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan' });
  }

  const { cvText, targetRole, statusKandidat } = req.body;

  if (!cvText || cvText.trim().length < 50) {
    return res.status(400).json({ error: 'Teks CV terlalu pendek untuk dianalisis (minimal 50 karakter).' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key Gemini belum diatur di server.' });
  }

  const prompt = `Kamu adalah Senior HRD Indonesia. Audit CV ini dengan bahasa lugas, padat, dan langsung ke inti.
Posisi: ${targetRole || 'Umum'} | Status: ${statusKandidat || 'Fresh Graduate'}
CV:
"""
${cvText.slice(0, 7000)}
"""

Keluarkan HANYA JSON valid (tanpa teks lain) sesuai struktur ini:
{
  "skorTotal": 76,
  "pilar": { "atsFormat": 80, "dampakAngka": 65, "relevansiSkill": 78, "strukturKejelasan": 82 },
  "level": "L3 · Siap Bersaing",
  "potensi": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "1 kalimat kesan pertama HRD.",
  "detik0_2": "Scan header & ringkasan CV (1 kalimat).",
  "detik2_4": "Evaluasi pengalaman & skill (1 kalimat).",
  "detik4_6": "Keputusan lanjut interview atau skip (1 kalimat).",
  "daftarKesalahan": ["Kesalahan spesifik 1", "Kesalahan spesifik 2", "Kesalahan spesifik 3"],
  "missingKeywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
  "rewrites": [
    { "sebelum": "Kutipan kalimat lemah 1 dari CV", "sesudah": "Perbaikan dengan Action Verb + Angka" },
    { "sebelum": "Kutipan kalimat lemah 2 dari CV", "sesudah": "Perbaikan kalimat 2" },
    { "sebelum": "Kutipan kalimat lemah 3 dari CV", "sesudah": "Perbaikan kalimat 3" }
  ],
  "prediksiInterview": [
    { "pertanyaan": "Pertanyaan interview 1 dari CV", "tipsJawab": "Tips jawab singkat" },
    { "pertanyaan": "Pertanyaan interview 2", "tipsJawab": "Tips jawab singkat" },
    { "pertanyaan": "Pertanyaan interview 3", "tipsJawab": "Tips jawab singkat" }
  ]
}`;

  const daftarModel = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
  ];

  // 1. Coba panggil Gemini AI terlebih dahulu
  for (const model of daftarModel) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2500,
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const hasilAnalisis = JSON.parse(rawText);
        return res.status(200).json(hasilAnalisis);
      }
    } catch (err) {
      continue;
    }
  }

  // 2. Fallback Otomatis Jika Server AI Penuh (Anti-Gagal & Instan)
  const hasilLokal = jalankanAuditLokal(cvText, targetRole, statusKandidat);
  return res.status(200).json(hasilLokal);
}

function jalankanAuditLokal(cvText, targetRole, statusKandidat) {
  const teksLower = cvText.toLowerCase();
  const role = targetRole || 'Posisi Incaran';

  const adaEmail = /@/.test(cvText);
  const adaNomor = /(\+62|08)\d{7,}/.test(cvText.replace(/[\s-]/g, ''));
  const adaAngka = /\d+%|\d+\s*(orang|tim|proyek|project|unit|bulan|tahun|juta|ribu)/i.test(cvText);
  const adaPengalaman = /(pengalaman|experience|magang|intern|kerja|organisasi|proyek|project)/i.test(teksLower);
  const adaSkill = /(skill|keahlian|kemampuan|tools|software)/i.test(teksLower);

  const skorFormat = (adaEmail ? 45 : 20) + (adaNomor ? 40 : 15) + (cvText.length > 400 ? 15 : 5);
  const skorDampak = adaAngka ? 78 : 52;
  const skorSkill = adaSkill ? 76 : 55;
  const skorStruktur = (adaPengalaman ? 50 : 25) + (adaSkill ? 35 : 15) + 10;
  const skorTotal = Math.round((skorFormat + skorDampak + skorSkill + skorStruktur) / 4);

  const kalimatAsli = cvText
    .split(/[\n•\-]/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 130);

  const kutipan1 = kalimatAsli[0] || 'Bertanggung jawab membantu operasional dan administrasi tim harian.';
  const kutipan2 = kalimatAsli[1] || 'Mengikuti kegiatan proyek dan berkoordinasi dengan anggota tim.';
  const kutipan3 = kalimatAsli[2] || 'Mengoperasikan perangkat lunak standar untuk menyelesaikan tugas.';

  const kesalahan = [];
  if (!adaAngka) kesalahan.push('Minim kuantifikasi hasil: Belum terlihat angka pencapaian terukur (persentase, target, atau skala proyek).');
  if (!adaEmail || !adaNomor) kesalahan.push('Informasi kontak kurang lengkap: Pastikan email aktif dan nomor WhatsApp tercantum jelas di bagian atas.');
  if (!adaSkill) kesalahan.push('Bagian Keahlian (Skills) belum terpisah jelas sehingga mesin ATS sulit memindai kompetensi inti kamu.');
  if (kesalahan.length < 3) kesalahan.push('Beberapa deskripsi masih berbentuk daftar tugas pasif, belum menonjolkan kontribusi dan hasil akhir.');

  return {
    skorTotal,
    pilar: {
      atsFormat: Math.min(95, skorFormat),
      dampakAngka: skorDampak,
      relevansiSkill: skorSkill,
      strukturKejelasan: Math.min(95, skorStruktur)
    },
    level: skorTotal >= 75 ? 'L3 · Siap Bersaing' : 'L2 · Perlu Optimasi',
    potensi: 'L4 · Kandidat Kuat',
    topPersen: skorTotal >= 75 ? 'Top 20% kandidat' : 'Top 35% kandidat',
    ringkasanKesan: `Struktur dasar untuk posisi ${role} (${statusKandidat || 'Kandidat'}) sudah terbaca, namun perlu penajaman bukti angka agar langsung menarik perhatian HRD.`,
    detik0_2: adaEmail && adaNomor ? 'Header dan kontak utama langsung terbaca rapi di bagian atas.' : 'HRD sempat mencari detail kontak dan ringkasan profil di bagian atas.',
    detik2_4: adaPengalaman ? 'Riwayat pengalaman/proyek ditemukan, namun HRD mencari skala dampak dan hasil konkretnya.' : 'Bagian pengalaman atau proyek relevan masih kurang menonjol saat pemindaian cepat.',
    detik4_6: skorTotal >= 72 ? 'Berpotensi lanjut ke tahap screening awal jika kata kunci teknis disesuaikan.' : 'Berisiko terlewat oleh filter ATS jika belum menambahkan metrik pencapaian dan keyword posisi.',
    daftarKesalahan: kesalahan.slice(0, 3),
    missingKeywords: [
      role,
      'Project Management',
      'Problem Solving',
      'Data Analysis',
      'Cross-functional Collaboration'
    ],
    rewrites: [
      {
        sebelum: kutipan1,
        sesudah: `Mengoptimalkan proses kerja harian dan menyelesaikan 100% target operasional tim tepat waktu sesuai standar kualitas perusahaan.`
      },
      {
        sebelum: kutipan2,
        sesudah: `Berkolaborasi dalam tim lintas fungsi untuk mengeksekusi proyek ${role}, meningkatkan efisiensi alur kerja hingga 20%.`
      },
      {
        sebelum: kutipan3,
        sesudah: `Menganalisis dan menyusun laporan evaluasi berkala yang membantu mempercepat pengambilan keputusan operasional tim.`
      }
    ],
    prediksiInterview: [
      {
        pertanyaan: `Dari pengalaman atau proyek di CV kamu, pencapaian mana yang paling relevan untuk posisi ${role}?`,
        tipsJawab: 'Gunakan metode STAR (Situasi, Tugas, Aksi, Hasil) dan sebutkan angka atau dampak nyata dari kontribusimu.'
      },
      {
        pertanyaan: 'Apa kendala teknis terbesar yang pernah kamu hadapi saat mengerjakan proyek dan bagaimana solusinya?',
        tipsJawab: 'Fokus pada langkah analisis masalah yang kamu ambil serta hasil akhir setelah solusi diterapkan.'
      },
      {
        pertanyaan: 'Mengapa kamu tertarik melamar posisi ini dan nilai tambah apa yang bisa kamu bawa ke tim kami?',
        tipsJawab: 'Hubungkan keahlian utama di CV kamu dengan kebutuhan spesifik perusahaan secara percaya diri.'
      }
    ]
  };
}
