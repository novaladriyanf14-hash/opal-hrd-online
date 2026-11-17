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

  const prompt = `Kamu adalah Senior HRD & Recruiter profesional di Indonesia. Tugasmu melakukan audit mendalam terhadap CV kandidat berikut secara jujur, tajam, empatik, dan konstruktif dalam Bahasa Indonesia yang natural.

Data Kandidat:
- Posisi Incaran: ${targetRole || 'Umum'}
- Status Kandidat: ${statusKandidat || 'Fresh Graduate'}
- Isi Teks CV:
"""
${cvText.slice(0, 14000)}
"""

Berikan output HANYA dalam format JSON valid (tanpa markdown \`\`\`json) dengan struktur persis seperti berikut:
{
  "skorTotal": 76,
  "pilar": {
    "atsFormat": 80,
    "dampakAngka": 65,
    "relevansiSkill": 78,
    "strukturKejelasan": 82
  },
  "level": "L3 · Siap Bersaing",
  "potensi": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "1-2 kalimat reaksi jujur HRD di 3 detik pertama melihat CV ini.",
  "detik0_2": "Reaksi HR saat scan bagian atas/header dan ringkasan CV.",
  "detik2_4": "Reaksi HR saat membaca pengalaman kerja/magang/projek/organisasi.",
  "detik4_6": "Keputusan akhir HR: lanjut interview atau skip dan alasannya.",
  "daftarKesalahan": [
    "Kesalahan spesifik 1 (misal: deskripsi tugas pasif, info kurang lengkap, atau typo/tata bahasa)",
    "Kesalahan spesifik 2",
    "Kesalahan spesifik 3"
  ],
  "missingKeywords": [
    "Kata kunci / skill ATS 1 yang relevan dengan posisi incaran tapi belum muncul di CV",
    "Kata kunci / skill ATS 2",
    "Kata kunci / skill ATS 3",
    "Kata kunci / skill ATS 4",
    "Kata kunci / skill ATS 5"
  ],
  "rewrites": [
    {
      "sebelum": "Kutipan asli kalimat 1 dari CV kandidat yang masih lemah/kurang menjual",
      "sesudah": "Versi perbaikan dengan rumus Action Verb + Tugas + Dampak/Angka"
    },
    {
      "sebelum": "Kutipan asli kalimat 2 dari CV kandidat",
      "sesudah": "Versi perbaikan kalimat 2 yang lebih tajam dan ramah ATS"
    },
    {
      "sebelum": "Kutipan asli kalimat 3 dari CV kandidat",
      "sesudah": "Versi perbaikan kalimat 3 yang lebih profesional"
    }
  ],
  "prediksiInterview": [
    {
      "pertanyaan": "Pertanyaan interview menjebak 1 berdasarkan isi/celah di CV kandidat",
      "tipsJawab": "Kisi-kisi singkat cara menjawabnya dengan metode STAR"
    },
    {
      "pertanyaan": "Pertanyaan interview 2 berdasarkan pengalaman/skill di CV",
      "tipsJawab": "Kisi-kisi singkat cara menjawabnya"
    },
    {
      "pertanyaan": "Pertanyaan interview 3 terkait kesiapan di posisi incaran",
      "tipsJawab": "Kisi-kisi singkat cara menjawabnya"
    }
  ]
}`;

  const daftarModel = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ];

  let lastError = 'Server AI sedang padat, silakan coba klik analisis beberapa detik lagi.';

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
              temperature: 0.4,
              responseMimeType: 'application/json'
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
      const hasilAnalisis = JSON.parse(rawText);

      return res.status(200).json(hasilAnalisis);
    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  return res.status(503).json({ error: lastError });
}
