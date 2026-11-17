export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan' });
  }

  const { cvText, targetRole, statusKandidat } = req.body;

  if (!cvText || cvText.trim().length < 50) {
    return res.status(400).json({ error: 'Teks CV terlalu pendek untuk dianalisis.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key Gemini belum diatur di server.' });
  }

  const prompt = `Kamu adalah Senior HRD & Recruiter profesional di Indonesia. Tugasmu mereview CV kandidat berikut secara jujur, tajam, empatik, dan konstruktif dalam Bahasa Indonesia yang natural.

Data Kandidat:
- Posisi Incaran: ${targetRole || 'Umum'}
- Status: ${statusKandidat || 'Fresh Graduate'}
- Isi Teks CV:
"""
${cvText.slice(0, 12000)}
"""

Berikan output HANYA dalam format JSON valid (tanpa markdown \`\`\`json) dengan struktur persis seperti berikut:
{
  "skor": 75,
  "level": "L3 · Siap Bersaing",
  "potensi": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "1-2 kalimat reaksi jujur HRD di 3 detik pertama melihat CV ini.",
  "detik0_2": "Reaksi HR saat scan bagian atas/header CV.",
  "detik2_4": "Reaksi HR saat membaca pengalaman/projek/organisasi.",
  "detik4_6": "Keputusan akhir HR: lanjut interview atau skip dan alasannya.",
  "blindspot": "1 kelemahan terbesar atau aset kandidat yang sebenarnya bagus tapi kurang ditonjolkan.",
  "sebelumRewrite": "Ambil 1 kutipan kalimat asli dari CV kandidat yang masih lemah/pasif.",
  "sesudahRewrite": "Tulis ulang kalimat tersebut agar berorientasi dampak, angka, dan ramah ATS."
}`;

  // Daftar model berurutan: jika model pertama padat, otomatis pindah ke cadangan
  const daftarModel = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ];

  let lastError = 'Server AI sedang sibuk, silakan coba beberapa saat lagi.';

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
        continue; // Lanjut coba model berikutnya
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
