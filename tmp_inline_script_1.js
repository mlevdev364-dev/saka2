
        // Helper wrapper that replaces native alert() with SweetAlert2
        function showAlert(msg, icon) {
            try {
                if (!icon) {
                    const l = String(msg).toLowerCase();
                    if (l.includes('berhasil') || l.includes('success')) icon = 'success';
                    else if (l.includes('gagal') || l.includes('error') || l.includes('failed')) icon = 'error';
                    else if (l.includes('peringatan') || l.includes('warning')) icon = 'warning';
                    else icon = 'info';
                }
                Swal.fire({ text: String(msg), icon: icon, confirmButtonText: 'OK' });
            } catch (e) {
                // If SweetAlert is not available, fall back to console to avoid native alert
                console.log('ALERT:', msg);
            }
        }
    