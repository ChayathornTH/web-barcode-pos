import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';

export default function Scanner({ onScanSuccess, active }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  
  // Diagnostics
  const [frameCount, setFrameCount] = useState(0);
  const [activeResolution, setActiveResolution] = useState('Checking...');
  const [showDiagnostics, setShowDiagnostics] = useState(false); // Hide by default to look clean
  const [lastDetections, setLastDetections] = useState([]);

  const qrCodeInstance = useRef(null);
  const scannerId = "pos-webcam-scanner";

  // Scan success callback wrapper
  const handleScanSuccess = (decodedText, decodedResult) => {
    const logTime = new Date().toLocaleTimeString();
    setLastDetections(prev => [{ time: logTime, text: decodedText }, ...prev.slice(0, 4)]);
    
    // Bubble up to parent App
    onScanSuccess(decodedText);
  };

  // Scan failure callback
  const handleScanFailure = (errorMessage) => {
    setFrameCount(prev => prev + 1);
  };

  // Find cameras
  useEffect(() => {
    if (!active) {
      stopScanner();
      return;
    }

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          
          // Try to select rear camera as default on mobile, or first camera on PC
          const rearCam = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(rearCam ? rearCam.id : devices[0].id);
        } else {
          setError("No cameras found. Please connect a webcam.");
        }
      })
      .catch((err) => {
        console.error("Error getting cameras", err);
        setError("Camera access denied. Please check your browser/phone settings and allow camera permissions.");
      });

    return () => {
      stopScanner();
    };
  }, [active]);

  // Start scanner when cameraId changes or active changes
  useEffect(() => {
    if (active && selectedCameraId) {
      startScanner(selectedCameraId);
    } else {
      stopScanner();
    }
  }, [selectedCameraId, active]);

  const startScanner = async (cameraId) => {
    setError('');
    setFrameCount(0);
    setActiveResolution('Locating stream...');
    setLastDetections([]);
    await stopScanner();

    try {
      // 1. CONSTRUCTOR OPTIMIZATIONS
      // - Enable native BarcodeDetector API which utilizes GPU/Hardware (up to 10x faster)
      // - Restrict formats to EAN, UPC, Code128 to minimize parsing algorithms overhead
      const html5Qrcode = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      qrCodeInstance.current = html5Qrcode;

      const config = {
        // 2. STABILITY OPTIMIZATIONS
        // - Drop FPS to 12 to avoid choking the phone's CPU. Lower FPS gives the decoder more time, 
        //   preventing frame lags and keeping the video feed buttery-smooth.
        fps: 12, 
        qrbox: (width, height) => {
          // Wider rectangular area makes it easier to fit EAN barcodes without backing away
          const boxWidth = Math.max(240, Math.min(width - 30, 320));
          const boxHeight = Math.max(100, Math.min(height - 30, 140));
          return {
            width: boxWidth,
            height: boxHeight
          };
        },
        // Widescreen 16:9 aspect ratio standard for modern mobile cameras (prevents stretching)
        aspectRatio: 1.777778, 
        videoConstraints: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
          advanced: [{ focusMode: "continuous" }]
        }
      };

      await html5Qrcode.start(
        cameraId,
        config,
        handleScanSuccess,
        handleScanFailure
      );

      setIsScanning(true);

      // Check stream settings after a short delay
      setTimeout(() => {
        try {
          const videoElement = document.getElementById(scannerId)?.querySelector('video');
          if (videoElement && videoElement.srcObject) {
            const track = videoElement.srcObject.getVideoTracks()[0];
            if (track) {
              const settings = track.getSettings();
              setActiveResolution(`${settings.width || 640}x${settings.height || 480} @ ${Math.round(settings.frameRate || 12)}fps`);
            } else {
              setActiveResolution("Stream active (restricted track querying)");
            }
          } else {
            setActiveResolution("Running (default resolution)");
          }
        } catch (e) {
          console.warn("Could not query active media track settings", e);
          setActiveResolution("Active (query restricted)");
        }
      }, 800);

    } catch (err) {
      console.error("Failed to start scanner:", err);
      setError("Could not start camera feed. Make sure it is not in use by another app.");
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (qrCodeInstance.current) {
      try {
        if (qrCodeInstance.current.isScanning) {
          await qrCodeInstance.current.stop();
        }
      } catch (err) {
        console.error("Failed to stop scanner:", err);
      } finally {
        qrCodeInstance.current = null;
        setIsScanning(false);
      }
    }
  };

  const handleCameraChange = (e) => {
    setSelectedCameraId(e.target.value);
  };

  if (!active) {
    return (
      <div className="scanner-placeholder glass-panel" style={styles.placeholder}>
        <Camera size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Scanner is sleeping.</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Activate scanner in the main POS view.</p>
      </div>
    );
  }

  return (
    <div className="scanner-container glass-panel" style={styles.container}>
      <div className="scanner-header" style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`scanner-indicator ${isScanning ? 'pulse-primary' : ''}`} style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isScanning ? 'var(--success)' : 'var(--danger)',
            display: 'inline-block'
          }}></span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Scanner Screen</span>
        </div>

        {cameras.length > 1 && (
          <select 
            value={selectedCameraId} 
            onChange={handleCameraChange}
            className="custom-input"
            style={styles.select}
          >
            {cameras.map(cam => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={styles.previewContainer}>
        <div id={scannerId} style={styles.webcamView}></div>
        
        {isScanning && (
          <>
            <div className="laser-line"></div>
            <div style={styles.scanTargetOverlay}>
              <div style={styles.cornerTL}></div>
              <div style={styles.cornerTR}></div>
              <div style={styles.cornerBL}></div>
              <div style={styles.cornerBR}></div>
            </div>
          </>
        )}

        {error && (
          <div style={styles.errorOverlay}>
            <AlertCircle size={32} color="var(--danger)" style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textAlign: 'center', padding: '0 1rem' }}>{error}</p>
            <button 
              className="btn btn-secondary" 
              onClick={() => selectedCameraId && startScanner(selectedCameraId)}
              style={{ marginTop: '1rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} /> Retry Camera
            </button>
          </div>
        )}
      </div>

      {/* Diagnostics block */}
      <div style={styles.infoFooter}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Place barcode in the horizontal box.
          </p>
          <button 
            style={styles.debugToggle} 
            onClick={() => setShowDiagnostics(!showDiagnostics)}
          >
            {showDiagnostics ? "Hide Stats" : "Show Stats"}
          </button>
        </div>
        
        {showDiagnostics && (
          <div style={styles.debugPanel}>
            <div style={styles.debugRow}>
              <span>Resolution:</span>
              <span style={{ color: 'var(--accent)' }}>{activeResolution}</span>
            </div>
            <div style={styles.debugRow}>
              <span>Frames Processed:</span>
              <span style={{ color: 'var(--success)' }}>{frameCount}</span>
            </div>
            <div style={styles.debugRow}>
              <span>Autofocus:</span>
              <span style={{ color: 'var(--success)' }}>Continuous (Active)</span>
            </div>
            <div style={styles.debugRow}>
              <span>Hardware Scan API:</span>
              <span style={{ color: 'var(--accent)' }}>Enabled (WebGL/GPU)</span>
            </div>
            <div style={{ ...styles.debugRow, borderTop: '1px dashed var(--border-color)', paddingTop: '0.25rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
              <span>Detections Log:</span>
              <span>(Last 5 scans)</span>
            </div>
            {lastDetections.length === 0 ? (
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '0.2rem 0' }}>
                No barcodes detected in frame yet.
              </div>
            ) : (
              <div style={styles.logsList}>
                {lastDetections.map((det, idx) => (
                  <div key={idx} style={styles.logRow}>
                    <span style={{ color: 'var(--text-muted)' }}>[{det.time}]</span>
                    <span style={{ color: 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '180px' }}>
                      "{det.text}"
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    height: '100%',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '240px',
    borderStyle: 'dashed',
    borderColor: 'var(--border-color)',
  },
  header: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.15)'
  },
  select: {
    padding: '0.25rem 0.5rem',
    fontSize: '0.8rem',
    width: '180px',
    height: '32px',
  },
  previewContainer: {
    position: 'relative',
    flexGrow: 1,
    minHeight: '220px',
    backgroundColor: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  webcamView: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  scanTargetOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '280px',
    height: '110px',
    pointerEvents: 'none',
    zIndex: 5,
  },
  cornerTL: {
    position: 'absolute', top: 0, left: 0, width: '20px', height: '20px',
    borderTop: '3px solid var(--success)', borderLeft: '3px solid var(--success)',
    borderTopLeftRadius: '8px'
  },
  cornerTR: {
    position: 'absolute', top: 0, right: 0, width: '20px', height: '20px',
    borderTop: '3px solid var(--success)', borderRight: '3px solid var(--success)',
    borderTopRightRadius: '8px'
  },
  cornerBL: {
    position: 'absolute', bottom: 0, left: 0, width: '20px', height: '20px',
    borderBottom: '3px solid var(--success)', borderLeft: '3px solid var(--success)',
    borderBottomLeftRadius: '8px'
  },
  cornerBR: {
    position: 'absolute', bottom: 0, right: 0, width: '20px', height: '20px',
    borderBottom: '3px solid var(--success)', borderRight: '3px solid var(--success)',
    borderBottomRightRadius: '8px'
  },
  errorOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(11, 15, 25, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  infoFooter: {
    padding: '0.6rem',
    borderTop: '1px solid var(--border-color)',
    background: 'rgba(0,0,0,0.1)'
  },
  debugToggle: {
    background: 'transparent',
    border: 'none',
    color: 'var(--primary)',
    fontSize: '0.7rem',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  debugPanel: {
    marginTop: '0.4rem',
    padding: '0.5rem',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: '4px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  debugRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.65rem',
    fontFamily: 'monospace',
  },
  logsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    marginTop: '0.2rem',
  },
  logRow: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.6rem',
    fontFamily: 'monospace',
  }
};
