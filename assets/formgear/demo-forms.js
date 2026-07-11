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

// Form contoh/demo (dummy) sudah dihapus sepenuhnya sesuai permintaan --
// aplikasi tidak lagi menyertakan form "demo-kegiatan", "demo-pelaporan",
// maupun "demo-feedback". Semua form yang tampil di FormGear sekarang murni
// berasal dari form yang dibuat pengguna sendiri lewat Form Builder
// (tersimpan di localStorage dan/atau Firebase). Array ini sengaja
// dibiarkan kosong -- FormGearBuilderInstance.getAllFormDefinitions() akan
// menggabungkannya dengan definisi form lokal jika suatu saat template
// contoh ingin ditambahkan kembali.
window.FormGearSampleForms = [];
