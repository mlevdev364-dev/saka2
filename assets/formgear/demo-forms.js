window.FormGearTemplateCatalog = [
  {
    id: "survey",
    name: "Survey Kegiatan",
    description:
      "Tampilan form kegiatan lapangan dengan kelompok pertanyaan induk dan anak.",
    templateName: "Survey Kegiatan",
  },
  {
    id: "report",
    name: "Pelaporan Harian",
    description:
      "Template laporan harian dengan sections rincian dan observasi.",
    templateName: "Pelaporan Harian",
  },
  {
    id: "feedback",
    name: "Feedback Lapangan",
    description:
      "Template feedback lapangan untuk hasil inspeksi dan catatan lapangan.",
    templateName: "Feedback Lapangan",
  },
];

window.FormGearSampleForms = [
  {
    id: "demo-kegiatan",
    name: "Form Kegiatan Survey",
    description:
      "Form berjenjang untuk mendokumentasikan kegiatan survey lapangan.",
    category: "Survey",
    templateId: "survey",
    createdAt: 1710000000000,
    sections: [
      {
        title: "Data Lokasi",
        description: "Informasi lokasi dan tim pelaksana.",
        fields: [
          {
            label: "Kode Lokasi",
            name: "kode_lokasi",
            type: "text",
            placeholder: "Masukkan kode lokasi",
            children: [],
          },
          {
            label: "Nama Lokasi",
            name: "nama_lokasi",
            type: "text",
            placeholder: "Masukkan nama lokasi",
            children: [],
          },
          {
            label: "Koordinat GPS",
            name: "koordinat",
            type: "text",
            placeholder: "Format: -6.200, 106.816",
            children: [],
          },
        ],
      },
      {
        title: "Detail Kegiatan",
        description:
          "Kelompok pertanyaan utama dan turunan untuk hasil kegiatan.",
        fields: [
          {
            label: "Jenis Kegiatan",
            name: "jenis_kegiatan",
            type: "select",
            placeholder: "",
            options: ["Observasi", "Wawancara", "Dokumentasi", "Lainnya"],
            children: [
              {
                label: "Jika Lainnya, jelaskan",
                name: "lainnya_jenis_kegiatan",
                type: "text",
                placeholder: "Jelaskan jenis kegiatan",
                children: [],
              },
            ],
          },
          {
            label: "Jumlah Responden",
            name: "jumlah_responden",
            type: "number",
            placeholder: "Masukkan angka",
            children: [],
          },
          {
            label: "Catatan Khusus",
            name: "catatan_khusus",
            type: "textarea",
            placeholder: "Isi catatan penting",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "demo-pelaporan",
    name: "Form Pelaporan Harian",
    description: "Form pelaporan dengan section ringkas dan daftar kegiatan.",
    category: "Pelaporan",
    templateId: "report",
    createdAt: 1710000000000,
    sections: [
      {
        title: "Info Petugas",
        description: "Data petugas dan jadwal.",
        fields: [
          {
            label: "Nama Petugas",
            name: "nama_petugas",
            type: "text",
            placeholder: "Masukkan nama petugas",
            children: [],
          },
          {
            label: "Tanggal Laporan",
            name: "tanggal_laporan",
            type: "text",
            placeholder: "YYYY-MM-DD",
            children: [],
          },
        ],
      },
      {
        title: "Ringkasan Aktivitas",
        description: "Detail aktivitas dan hasil lapangan.",
        fields: [
          {
            label: "Jumlah Lokasi Dikunjungi",
            name: "jumlah_lokasi",
            type: "number",
            placeholder: "Masukkan angka",
            children: [],
          },
          {
            label: "Hasil Utama",
            name: "hasil_utama",
            type: "textarea",
            placeholder: "Ringkas hasil lapangan",
            children: [],
          },
          {
            label: "Permasalahan",
            name: "permasalahan",
            type: "textarea",
            placeholder: "Tuliskan kendala yang ditemui",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "demo-feedback",
    name: "Form Feedback Lapangan",
    description: "Form feedback untuk pelaporan inspeksi dan tindak lanjut.",
    category: "Feedback",
    templateId: "feedback",
    createdAt: 1710000000000,
    sections: [
      {
        title: "Sumber Feedback",
        description: "Detail sumber dan konteks feedback.",
        fields: [
          {
            label: "Nama Reviewer",
            name: "nama_reviewer",
            type: "text",
            placeholder: "Masukkan nama reviewer",
            children: [],
          },
          {
            label: "Tanggal Feedback",
            name: "tanggal_feedback",
            type: "text",
            placeholder: "YYYY-MM-DD",
            children: [],
          },
        ],
      },
      {
        title: "Observasi dan Tindak Lanjut",
        description: "Observasi, langkah perbaikan, dan status tindak lanjut.",
        fields: [
          {
            label: "Observasi Utama",
            name: "observasi_utama",
            type: "textarea",
            placeholder: "Tuliskan hasil observasi",
            children: [],
          },
          {
            label: "Tindak Lanjut",
            name: "tindak_lanjut",
            type: "textarea",
            placeholder: "Sebutkan langkah tindak lanjut",
            children: [],
          },
          {
            label: "Status Akhir",
            name: "status_akhir",
            type: "select",
            placeholder: "",
            options: ["Belum", "Sedang", "Selesai"],
            children: [],
          },
        ],
      },
    ],
  },
];
