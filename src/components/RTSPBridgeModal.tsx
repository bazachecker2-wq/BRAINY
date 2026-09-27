import React, { useState, useEffect } from 'react';
import {
  X,
  Video,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  Terminal,
  ArrowRight,
  Search,
  Bluetooth,
  Wifi,
  Radio,
  RefreshCw,
  Sliders,
  Camera,
  Mic,
  Volume2,
  Check,
  Copy,
  ExternalLink,
  Laptop,
  Smartphone,
  Layers,
  Sparkles
} from 'lucide-react';

interface RTSPBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

interface CameraPreset {
  brand: string;
  template: string;
  defaultPort: number;
  note: string;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { brand: 'Hikvision / HiWatch', template: 'rtsp://admin:password@{IP}:554/Streaming/Channels/101', defaultPort: 554, note: 'Основной H.264 поток' },
  { brand: 'Dahua / Imou', template: 'rtsp://admin:password@{IP}:554/cam/realmonitor?channel=1&subtype=0', defaultPort: 554, note: 'Канал 1, основной поток' },
  { brand: 'TP-Link Tapo', template: 'rtsp://user:password@{IP}:554/stream1', defaultPort: 554, note: 'Качественный HD поток' },
  { brand: 'Reolink', template: 'rtsp://admin:password@{IP}:554/h264Preview_01_main', defaultPort: 554, note: 'Основной поток камеры' },
  { brand: 'Axis Communications', template: 'rtsp://root:password@{IP}:554/axis-media/media.amp', defaultPort: 554, note: 'ONVIF/RTSP поток' },
  { brand: 'Uniview (UNV)', template: 'rtsp://admin:password@{IP}:554/unicast/c1/s0/live', defaultPort: 554, note: 'Универсальный RTSP канал' },
  { brand: 'Xiaomi / Wyze (OpenIPC/RTSP)', template: 'rtsp://admin:password@{IP}:8554/live', defaultPort: 8554, note: 'MediaMTX/OpenIPC прошивка' },
  { brand: 'Generic IP Camera', template: 'rtsp://{IP}:554/live', defaultPort: 554, note: 'Стандартный RTSP поток' }
];

export const RTSPBridgeModal: React.FC<RTSPBridgeModalProps> = ({ isOpen, onClose, roomId }) => {
  const [activeTab, setActiveTab] = useState<'rtsp' | 'scan' | 'ble' | 'hardware'>('rtsp');

  // RTSP Manual URL state
  const [rtspUrl, setRtspUrl] = useState('rtsp://192.168.1.120:554/live');
  const [selectedPreset, setSelectedPreset] = useState<string>('Generic IP Camera');
  const [cameraIpInput, setCameraIpInput] = useState('192.168.1.120');
  const [cameraUserInput, setCameraUserInput] = useState('admin');
  const [cameraPassInput, setCameraPassInput] = useState('');
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Subnet Scanner state
  const [subnetPrefix, setSubnetPrefix] = useState('192.168.1');
  const [startHost, setStartHost] = useState(1);
  const [endHost, setEndHost] = useState(30);
  const [scanPort, setScanPort] = useState(554);
  const [isScanningSubnet, setIsScanningSubnet] = useState(false);
  const [discoveredCandidates, setDiscoveredCandidates] = useState<any[]>([]);

  // Web Bluetooth (BLE) State
  const [isBleSupported, setIsBleSupported] = useState(false);
  const [isScanningBle, setIsScanningBle] = useState(false);
  const [connectedBleDevice, setConnectedBleDevice] = useState<any | null>(null);
  const [bleDeviceInfo, setBleDeviceInfo] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);

  // Hardware Devices State
  const [hardwareDevices, setHardwareDevices] = useState<MediaDeviceInfo[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsBleSupported(Boolean((navigator as any).bluetooth));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      enumerateHardware();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const enumerateHardware = async () => {
    setIsLoadingDevices(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setHardwareDevices(devices);
      }
    } catch (e) {
      console.warn('Device enumeration failed', e);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  // Build RTSP URL from preset
  const handleApplyPreset = (preset: CameraPreset) => {
    setSelectedPreset(preset.brand);
    let url = preset.template.replace('{IP}', cameraIpInput || '192.168.1.120');
    if (cameraUserInput) {
      url = url.replace('admin:', `${cameraUserInput}:`).replace('user:', `${cameraUserInput}:`).replace('root:', `${cameraUserInput}:`);
    }
    if (cameraPassInput) {
      url = url.replace(':password@', `:${cameraPassInput}@`);
    } else {
      url = url.replace(':password@', '@').replace('admin@', '').replace('user@', '').replace('root@', '');
    }
    setRtspUrl(url);
  };

  const handleTestAndProbe = async () => {
    setIsProbing(true);
    setErrorMsg(null);
    setProbeResult(null);

    try {
      const res = await fetch('/api/rtsp/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rtspUrl })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Не удалось валидировать RTSP поток');
      } else {
        setProbeResult(data);
      }
    } catch (err: any) {
      setErrorMsg(`Ошибка соединения: ${err.message}`);
    } finally {
      setIsProbing(false);
    }
  };

  // Subnet IP Camera Discovery
  const handleScanSubnet = async () => {
    setIsScanningSubnet(true);
    setErrorMsg(null);
    setDiscoveredCandidates([]);

    try {
      const res = await fetch('/api/rtsp/scan-subnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subnet: subnetPrefix,
          startHost,
          endHost,
          port: scanPort
        })
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.candidates)) {
        setDiscoveredCandidates(data.candidates);
      }
    } catch (e: any) {
      setErrorMsg(`Ошибка сканирования сети: ${e.message}`);
    } finally {
      setIsScanningSubnet(false);
    }
  };

  // Bluetooth BLE Discovery
  const handleScanBLE = async () => {
    setBleError(null);
    setIsScanningBle(true);

    try {
      const nav = navigator as any;
      if (!nav.bluetooth) {
        throw new Error('Web Bluetooth API не поддерживается вашим браузером (рекомендуется Chrome / Edge на HTTPS)');
      }

      // Request device with common streaming / media / sensor services or acceptAllDevices
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'generic_access', 'human_interface_device']
      });

      setConnectedBleDevice(device);
      setBleDeviceInfo(`Устройство: ${device.name || 'Беспроводная камера / BLE Контроллер'} (ID: ${device.id.substring(0, 8)}...)`);

      if (device.gatt) {
        const server = await device.gatt.connect();
        setBleDeviceInfo((prev) => `${prev} • Подключено к GATT серверу`);
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setBleError(err.message || 'Ошибка поиска BLE устройства');
      }
    } finally {
      setIsScanningBle(false);
    }
  };

  const handleDisconnectBLE = () => {
    if (connectedBleDevice && connectedBleDevice.gatt) {
      try {
        connectedBleDevice.gatt.disconnect();
      } catch (e) {
        // ignore
      }
    }
    setConnectedBleDevice(null);
    setBleDeviceInfo(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Менеджер устройств & RTSP шлюз</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  LOCAL DISCOVERY
                </span>
              </h3>
              <p className="text-[11px] text-neutral-400">RTSP камеры, сканирование подсети, BLE и аппаратные устройства</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center p-2 bg-neutral-950/60 border-b border-white/5 gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('rtsp')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 ${
              activeTab === 'rtsp'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>RTSP Камера</span>
          </button>

          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 ${
              activeTab === 'scan'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Сканер подсети</span>
          </button>

          <button
            onClick={() => setActiveTab('ble')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 ${
              activeTab === 'ble'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5 text-cyan-300" />
            <span>Bluetooth (BLE)</span>
          </button>

          <button
            onClick={() => setActiveTab('hardware')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 ${
              activeTab === 'hardware'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Аппаратные порты ({hardwareDevices.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* TAB 1: RTSP Direct Ingest & Presets */}
          {activeTab === 'rtsp' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 leading-relaxed">
                <span className="font-bold">Архитектура шлюза:</span> IP-камера (RTSP/ONVIF) &rarr; MediaMTX шлюз (H.264 zero-transcode) &rarr; WebRTC прямой эфир для зрителей комнаты <span className="font-mono font-bold text-white">/{roomId}</span>.
              </div>

              {/* Presets Grid */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Пресеты производителей камер:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CAMERA_PRESETS.map((preset) => (
                    <button
                      key={preset.brand}
                      onClick={() => handleApplyPreset(preset)}
                      className={`p-2.5 rounded-xl text-left border transition text-xs flex flex-col justify-between ${
                        selectedPreset === preset.brand
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-white font-semibold shadow-sm'
                          : 'bg-neutral-950/60 border-white/5 text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      <span className="truncate">{preset.brand}</span>
                      <span className="text-[10px] text-neutral-500 mt-1">{preset.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameters Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-medium">IP адрес камеры в сети</label>
                  <input
                    type="text"
                    value={cameraIpInput}
                    onChange={(e) => {
                      setCameraIpInput(e.target.value);
                      const currentPreset = CAMERA_PRESETS.find(p => p.brand === selectedPreset) || CAMERA_PRESETS[0];
                      handleApplyPreset(currentPreset);
                    }}
                    placeholder="192.168.1.120"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-medium">Логин (RTSP User)</label>
                  <input
                    type="text"
                    value={cameraUserInput}
                    onChange={(e) => setCameraUserInput(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-medium">Пароль (RTSP Password)</label>
                  <input
                    type="password"
                    value={cameraPassInput}
                    onChange={(e) => setCameraPassInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* URL String and Probe Button */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300">
                  Результирующий RTSP URL:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rtspUrl}
                    onChange={(e) => setRtspUrl(e.target.value)}
                    placeholder="rtsp://admin:pass@192.168.1.120:554/live"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                  <button
                    onClick={handleTestAndProbe}
                    disabled={isProbing || !rtspUrl}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow-md shadow-emerald-600/20"
                  >
                    {isProbing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isProbing ? 'Проверка...' : 'Проверить RTSP'}</span>
                  </button>
                </div>
              </div>

              {/* Validation Result */}
              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {probeResult && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>RTSP Поток успешно распознан и готов к ретрансляции</span>
                  </div>
                  <p className="text-neutral-300">
                    Путь ingest в MediaMTX: <code className="bg-neutral-950 px-2 py-0.5 rounded text-emerald-300 font-mono">{probeResult.suggestedMediaMTXPath}</code>
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Кодеки: <span className="text-neutral-200 font-medium">{probeResult.codec}</span> (прямая WebRTC передача без транскодирования).
                  </p>
                </div>
              )}

              {/* MediaMTX Ingest Command */}
              <div className="p-4 rounded-2xl bg-neutral-950/60 border border-white/5 space-y-2">
                <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" /> Команда запуска локального MediaMTX шлюза (Docker):
                </span>
                <pre className="p-3 rounded-xl bg-neutral-950 border border-white/5 text-[11px] font-mono text-neutral-300 overflow-x-auto select-all">
{`docker run --rm -it -e MTX_PROTOCOLS=tcp \\
  -p 8554:8554 -p 1935:1935 -p 8889:8889 \\
  bluenviron/mediamtx`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: Subnet Scanner */}
          {activeTab === 'scan' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 leading-relaxed">
                <span className="font-bold">Сканирование локальной сети:</span> Укажите диапазон IP адресов вашей домашней/офисной сети для автоматической генерации и проверки RTSP эндпоинтов камер на портах 554/8554.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] text-neutral-400 font-medium">Подсеть (Subnet)</label>
                  <input
                    type="text"
                    value={subnetPrefix}
                    onChange={(e) => setSubnetPrefix(e.target.value)}
                    placeholder="192.168.1"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-medium">Хосты (от - до)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={startHost}
                      onChange={(e) => setStartHost(Number(e.target.value))}
                      className="w-16 px-2 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono text-center"
                    />
                    <span className="text-neutral-500">-</span>
                    <input
                      type="number"
                      value={endHost}
                      onChange={(e) => setEndHost(Number(e.target.value))}
                      className="w-16 px-2 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono text-center"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-medium">RTSP Порт</label>
                  <input
                    type="number"
                    value={scanPort}
                    onChange={(e) => setScanPort(Number(e.target.value))}
                    placeholder="554"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-xs font-mono text-center"
                  />
                </div>
              </div>

              <button
                onClick={handleScanSubnet}
                disabled={isScanningSubnet}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
              >
                {isScanningSubnet ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{isScanningSubnet ? 'Сканирование IP-камер...' : 'Сгенерировать и просканировать адреса камер'}</span>
              </button>

              {discoveredCandidates.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-neutral-300">
                    Сгенерировано {discoveredCandidates.length} адресов для подключения:
                  </span>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {discoveredCandidates.map((cand, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-neutral-950/70 border border-white/5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-emerald-400 font-bold">{cand.ip}:{cand.port}</span>
                          <div className="text-[11px] text-neutral-400 font-mono truncate mt-0.5">
                            {cand.suggestedUrls[0]}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setRtspUrl(cand.suggestedUrls[0]);
                            setActiveTab('rtsp');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition shrink-0"
                        >
                          Выбрать
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Web Bluetooth (BLE) Device Discovery */}
          {activeTab === 'ble' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 leading-relaxed">
                <span className="font-bold">Web Bluetooth (BLE) интеграция:</span> Поиск и сопряжение с беспроводными камерами, стабилизаторами, PTZ-головками, Bluetooth микрофонами и кнопками спуска прямо из браузера через Web Bluetooth API.
              </div>

              {!isBleSupported ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Web Bluetooth API не активен в текущем браузере.</span>
                    <p className="mt-1 text-[11px] text-neutral-400">
                      Для использования BLE поиска запустите приложение в Google Chrome, Microsoft Edge или Opera по защищенному протоколу HTTPS.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {connectedBleDevice ? (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>BLE Устройство подключено</span>
                        </div>
                        <button
                          onClick={handleDisconnectBLE}
                          className="px-3 py-1 rounded-lg bg-neutral-900 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-xs transition"
                        >
                          Отключить
                        </button>
                      </div>
                      <p className="text-xs text-neutral-200 font-medium">{bleDeviceInfo}</p>
                    </div>
                  ) : (
                    <button
                      onClick={handleScanBLE}
                      disabled={isScanningBle}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                    >
                      <Bluetooth className={`w-4 h-4 ${isScanningBle ? 'animate-spin' : ''}`} />
                      <span>{isScanningBle ? 'Поиск Bluetooth устройств...' : 'Найти Bluetooth / BLE устройство'}</span>
                    </button>
                  )}

                  {bleError && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                      {bleError}
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-neutral-950/60 border border-white/5 space-y-2 text-xs text-neutral-400">
                    <span className="font-semibold text-neutral-200">Поддерживаемые типы BLE устройств:</span>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                      <li>Беспроводные микрофоны и петлички (Bluetooth LE Audio)</li>
                      <li>PTZ моторизованные штативы и подвесы (Gimbal remote controllers)</li>
                      <li>Bluetooth кнопки спуска затвора и смены ракурса</li>
                      <li>Портативные беспроводные экшн-камеры с BLE управлением</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Hardware Devices Explorer */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-300">
                  Обнаруженные видео и аудио устройства:
                </span>
                <button
                  onClick={enumerateHardware}
                  disabled={isLoadingDevices}
                  className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                  <span>Обновить</span>
                </button>
              </div>

              <div className="space-y-2">
                {hardwareDevices.map((dev, idx) => (
                  <div
                    key={dev.deviceId || idx}
                    className="p-3 rounded-2xl bg-neutral-950/70 border border-white/5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400 shrink-0">
                        {dev.kind === 'videoinput' ? <Camera className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-indigo-400" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-white block truncate">
                          {dev.label || `${dev.kind === 'videoinput' ? 'Видеокамера' : 'Микрофон'} #${idx + 1}`}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono truncate block">
                          ID: {dev.deviceId ? `${dev.deviceId.substring(0, 16)}...` : 'Системное устройство'}
                        </span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 text-[10px] font-mono shrink-0">
                      {dev.kind}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500 font-mono">BeamLive Ingest v2.4 • WebRTC & BLE</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
