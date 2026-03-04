
import { CameraCapabilities, Cameras, closeCamera, getAllCameras, getCurrentCameraCapabilities, getRemoteUploaderList, getServerInfo, isServerRunning, MdnsDevices, openCamera, OpenCameraArgs, RemoteUploaderList, scanMdnsDevices, ServerInfo, startRemoteUploader, startServer, stopRemoteUploader, stopServer } from "tauri-plugin-camera";
import "./App.css";
import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { Platform, platform } from "@tauri-apps/plugin-os";
import { checkPermissions, requestPermissions } from "@tauri-apps/api/core";
import { getBatteryOptimizationStatus, open_app_settings, requestIgnoreBatteryOptimizations } from "tauri-plugin-android-permissions";
import { BatteryStatus } from "../../../tauri_plugin/tauri-plugin-android-permissions/dist-js/types";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CameraControlPanel } from "./CameraControll";
const getRandomPort = () => Math.floor(Math.random() * (65535 - 30000 + 1)) + 30000;
function App() {
    const [serverIsRunning, setServerIsRunning] = createSignal(false);
    const [serverPort, setServerPort] = createSignal(getRandomPort());
    const [serverInfo, setServerInfo] = createSignal<ServerInfo | null>(null);
    const [isScanningMdns, setIsScanningMdns] = createSignal(false);
    const [mdnsDevices, setMdnsDevices] = createSignal<MdnsDevices | null>(null);

    const [currentPlatform, setCurrentPlatform] = createSignal<Platform | null>(null);

    const [remoteIsConnected, setRemoteIsConnected] = createSignal<RemoteUploaderList | null>(null);
    const [allCameras, setAllCameras] = createSignal<Cameras | null>(null);

    const [permissions, setPermissions] = createSignal<Permissions | null>(null);
    const [batteryStatus, setBatteryStatus] = createSignal<BatteryStatus | null>(null);

    const [isHLPermissionCard, setHLPermissionCard] = createSignal(false);
    const [isHLCameraButton, setHLCameraButton] = createSignal(false);
    let cameraButtonRef: HTMLButtonElement | undefined;

    const [openCameraArgs, setOpenCameraArgs] = createSignal<OpenCameraArgs | null>(null);
    const [isCameraRunning, setIsCameraRunning] = createSignal<OpenCameraArgs | null>(null);

    const [expandedAddr, setExpandedAddr] = createSignal<string | null>(null);
    const [toastMsg, setToastMsg] = createSignal<string | null>(null);
    const [currentCameraCapabilities, setCurrentCameraCapabilities] = createSignal<CameraCapabilities | null>(null);

    const scrollToCameraButton = () => {
        if (!cameraButtonRef) {
            console.error("找不到權限 Card 的 Ref！");
            return;
        }
        cameraButtonRef.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setHLPermissionCard(true);
        setTimeout(() => setHLPermissionCard(false), 3000);
        setHLCameraButton(true);
        setTimeout(() => setHLCameraButton(false), 3000);

    };

    onMount(async () => {
        let isRunning = await isServerRunning();
        setServerIsRunning(isRunning[0]);
        if (isRunning[0]) {
            setServerPort(isRunning[1]);
            let info = await getServerInfo(isRunning[1]);
            setServerInfo(info);
        }
        const currentPlatform = platform();
        setCurrentPlatform(currentPlatform);

        let remoteUploaderList = await getRemoteUploaderList();
        setRemoteIsConnected(remoteUploaderList);

        let allCameras = await getAllCameras();
        console.log(allCameras);
        setAllCameras(allCameras);
        let permissions = await checkPermissions<Permissions>("camera");
        setPermissions(permissions);

        let status = await getBatteryOptimizationStatus();
        setBatteryStatus({ isIgnoringOptimizations: status.isIgnoringOptimizations, isOptimized: status.isOptimized });

    });
    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => {
            setToastMsg(null);
        }, 3000);
    };
    const isCameraPermissionGranted = () => {
        return permissions()?.camera === 'granted';
    }
    const isNotificationPermissionGranted = () => {
        return permissions()?.postNotifications === 'granted';
    }

    const isBatteryOptimizationIgnored = () => {
        return batteryStatus()?.isIgnoringOptimizations == true;
    }

    const toggleExpand = (addr: string) => {
        if (expandedAddr() === addr) {
            setExpandedAddr(null);
        } else {
            setExpandedAddr(addr);
        }
    };
    const [streams, setStreams] = createSignal({
        local: { res: "偵測中", status: "未連線" },
        remote: { res: "偵測中", status: "未連線" }
    });

    let canvasRefs: { [key: string]: HTMLCanvasElement | undefined } = {
        local: undefined,
        remote: undefined
    };

    let sockets: { [key: string]: WebSocket | null } = {
        local: null,
        remote: null
    };

    const [preview, setPreview] = createSignal({
        local: false,
        remote: false
    });



    const connectToStream = (type: 'local' | 'remote', port: number) => {
        if (sockets[type]) sockets[type]!.close();

        const wsUrl = `ws://localhost:${port}/ws/${type}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'blob';
        sockets[type] = ws;

        let isProcessing = false;

        ws.onopen = () => {
            setStreams(prev => ({
                ...prev,
                [type]: { ...prev[type], status: `✅ 已連接 (${type === 'local' ? '本地' : '遠端'})` }
            }));
        };

        ws.onclose = () => {
            setStreams(prev => ({
                ...prev,
                [type]: { ...prev[type], status: "❌ 已斷開" }
            }));
        };

        ws.onmessage = async (event) => {
            const ref = canvasRefs[type];
            if (isProcessing || !ref || !(event.data instanceof Blob)) return;

            isProcessing = true;
            try {
                const bitmap = await createImageBitmap(event.data);
                const ctx = ref.getContext('2d', { alpha: false });

                if (ref.width !== bitmap.width) {
                    ref.width = bitmap.width;
                    ref.height = bitmap.height;
                    setStreams(prev => ({
                        ...prev,
                        [type]: { ...prev[type], res: `${bitmap.width}x${bitmap.height}` }
                    }));
                }
                ctx?.drawImage(bitmap, 0, 0);
                bitmap.close();
            } catch (err) {
                console.error(`${type} 解碼失敗:`, err);
            } finally {
                isProcessing = false;
            }
        };
    };


    createEffect(() => {
        const isRunning = serverIsRunning();
        const port = serverPort();

        if (isRunning && port > 0) {

            connectToStream('local', port);
            connectToStream('remote', port);
        } else {

            Object.keys(sockets).forEach((type) => {
                const t = type as 'local' | 'remote';
                if (sockets[t]) {
                    sockets[t]!.onclose = null;
                    sockets[t]!.close();
                    sockets[t] = null;
                }
            });

            setStreams({
                local: { res: "---", status: "未連線" },
                remote: { res: "---", status: "未連線" }
            });
        }
        onCleanup(() => {
            Object.values(sockets).forEach(ws => ws?.close());
        });
    });

    createEffect(() => {
        let currentCamera = isCameraRunning();
        if (currentCamera == null) {
            setCurrentCameraCapabilities(null);
        } else {
            getCurrentCameraCapabilities().then(res => {
                console.log(res);
                setCurrentCameraCapabilities(res);
            });
        }
    });




    return (
        <main class="container">


            <div class="card">
                <p class="card-title">伺服器</p>
                <input type="Number"
                    value={serverPort()}
                    oninput={(e) => setServerPort(e.currentTarget.valueAsNumber)}
                    name="" id=""
                    placeholder="Port"
                    min={1}
                    max={65535}
                    disabled={serverIsRunning()}
                />
                <button
                    disabled={serverIsRunning()}

                    onclick={() => startServer(serverPort()).then((serverInfo) => {
                        setServerIsRunning(true);
                        setServerInfo(serverInfo);
                    })}>啟動伺服器</button>
                <button
                    disabled={!serverIsRunning()}
                    onclick={() => stopServer().then(() => {
                        setServerIsRunning(false);
                        setServerInfo(null);

                    })}>關閉伺服器</button>

                <Show when={serverInfo()}>
                    <div class="server-list">
                        <p class="info">伺服器列表</p>
                        <ul class="interface-list">
                            {serverInfo()!.addr.map((addr) => (
                                <li class="interface-item-container">
                                    {/* 主項目 */}
                                    <div
                                        class="interface-item"
                                        onclick={() => toggleExpand(addr.addr)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <p class="name">{addr.interfaceName}</p>
                                        <p class="addr">{addr.addr}</p>
                                    </div>

                                    {/* 子選單 - 當地址匹配時顯示 */}
                                    <Show when={expandedAddr() === addr.addr}>
                                        <div class="sub-menu">

                                            <div class="url-item">

                                                <button class='shortcut-btn'
                                                    onclick={() => openUrl(`http://${addr.addr}/stream/remote`)}
                                                >遠端影像控制</button>
                                                <button class='shortcut-btn'
                                                    onclick={() => openUrl(`http://${addr.addr}/stream/local`)}
                                                >本地影像控制</button>

                                            </div>
                                            <div class="url-item">

                                                <button class='shortcut-btn'
                                                    onclick={() => openUrl(`http://${addr.addr}/video/remote`)}
                                                >遠端純影像</button>
                                                <button class='shortcut-btn'
                                                    onclick={() => openUrl(`http://${addr.addr}/video/local`)}
                                                >本地純影像</button>

                                            </div>
                                        </div>
                                    </Show>
                                </li>
                            ))}
                        </ul>
                    </div>

                </Show>
            </div>

            <div class="card">
                <p class="card-title">MDNS 掃描</p>
                <button
                    disabled={isScanningMdns()}
                    onclick={async () => {
                        setIsScanningMdns(true);
                        scanMdnsDevices().then((devices) => {
                            setIsScanningMdns(false);
                            setMdnsDevices(devices);
                            if (devices.devices == null || Object.values(devices.devices).length === 0) {
                                showToast("沒有找到裝置，請確保已透過 APP 開啟伺服器");
                            }
                        })
                        let remoteUploaderList = await getRemoteUploaderList();
                        setRemoteIsConnected(remoteUploaderList);
                    }
                    }>{isScanningMdns() ? "掃描中..." : "MDNS 掃描 3s"}</button>
                <div class="info-wrapper">
                    <p class="subinfo">透過 APP 開啟的伺服器會被搜尋到</p>
                    <p class="subinfo">點擊 IP 連線 將本地相機影像傳遞出去</p>
                    <p class="subinfo">再次點擊 IP 可以關閉連線</p>
                </div>

                <Show when={mdnsDevices()}>
                    <div class="mdns-list">
                        <ul>
                            <Switch>
                                <Match when={mdnsDevices()!.devices == null || Object.values(mdnsDevices()!.devices).length === 0}>
                                    <p class="no-device">沒有找到裝置</p>
                                </Match>
                                <Match when={mdnsDevices()!.devices == null || Object.values(mdnsDevices()!.devices).length != 0}>
                                    {Object.values(mdnsDevices()!.devices).map((device) => (
                                        <li class="device-card">
                                            <div class="device-header">
                                                <p class="host-name">{device.deviceInfo.hostName}</p>
                                                <p class="os-tag">{device.deviceInfo.osName}</p>
                                            </div>
                                            <div class="device-details">
                                                <div class="addr-wrapper">
                                                    {device.addr.map((ip) => (
                                                        <button
                                                            class="addr-row"
                                                            classList={{
                                                                'connected': remoteIsConnected()?.includes(`ws://${ip}:${device.port}/ws/upload`)
                                                            }}
                                                            onclick={() => {
                                                                if (remoteIsConnected()?.includes(`ws://${ip}:${device.port}/ws/upload`)) {
                                                                    stopRemoteUploader({ ip, port: device.port }).then(async () => {
                                                                        let remoteUploaderList = await getRemoteUploaderList();
                                                                        setRemoteIsConnected(remoteUploaderList);
                                                                        showToast(`已斷開 ${ip}:${device.port} 的遠端上傳`);
                                                                    }).catch(async () => {
                                                                        let remoteUploaderList = await getRemoteUploaderList();
                                                                        setRemoteIsConnected(remoteUploaderList);
                                                                    });
                                                                } else {
                                                                    startRemoteUploader({ ip, port: device.port }).then(async () => {
                                                                        let remoteUploaderList = await getRemoteUploaderList();
                                                                        setRemoteIsConnected(remoteUploaderList);
                                                                        showToast(`已連線到 ${ip}:${device.port} 的遠端上傳`);
                                                                    });
                                                                }
                                                            }}
                                                        >
                                                            <span class="ip-text">{ip}:{device.port}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                        </li>
                                    ))}
                                </Match>
                            </Switch>

                        </ul>
                    </div>
                </Show>
            </div>
            <Show when={currentPlatform() === 'android'}>

                <div class="card_camera">
                    <div class="camera-control">
                        <p class="card-title">本機相機裝置</p>
                        <div class="camera-handler">
                            <button onclick={() => {
                                if (!isCameraPermissionGranted()) {
                                    scrollToCameraButton();
                                    console.log("相機權限未授予，無法開啟相機");
                                    showToast("相機權限未授予，無法開啟相機");
                                    return;
                                }
                                if (openCameraArgs() == null) {
                                    console.log("沒有相機資訊，無法開啟相機");
                                    showToast("先在下方選擇相機與解析度，才能開啟相機");
                                    return
                                }

                                openCamera(openCameraArgs()!).then(() => {
                                    showToast(isCameraRunning() != null ? "已更新相機選擇" : "已開啟相機");
                                    setIsCameraRunning(openCameraArgs());
                                })
                            }}
                                classList={{ 'highlight-blue': isCameraRunning() != null }}
                            >{isCameraRunning() != null ? "更新相機選擇" : "開啟相機"}</button>
                            <button onclick={() => {
                                if (isCameraRunning() == null) {
                                    console.log("相機未開啟");
                                }
                                closeCamera().then(() => {
                                    setIsCameraRunning(null);
                                    showToast("已關閉相機");
                                })
                            }}>關閉相機</button>
                            <button onclick={() => getAllCameras()}>刷新相機資訊</button>
                        </div>
                    </div>
                    <div class="camera-list">
                        <For each={allCameras()?.devices}>
                            {(device) => (
                                <div class="camera-card">
                                    <div class="camera-header">
                                        <span class="camera-id">ID: {device.id}</span>
                                        <span class="lens-tag" classList={{ 'front': device.lensFacing.includes('FRONT') }}>
                                            {device.lensFacing}
                                        </span>
                                    </div>

                                    <div class="camera-grid">
                                        <div class="stat">
                                            <span class="label">光圈</span>
                                            <span class="value">f/{device.aperture}</span>
                                        </div>
                                        <div class="stat">
                                            <span class="label">焦距</span>
                                            <span class="value">{device.focalLength}mm</span>
                                        </div>
                                        <div class="stat">
                                            <span class="label">硬體層級</span>
                                            <span class="value">{device.hardwareLevel}</span>
                                        </div>
                                        <div class="stat">
                                            <span class="label">傳感器方向</span>
                                            <span class="value">{device.sensorOrientation}°</span>
                                        </div>
                                    </div>

                                    <div class="res-section">
                                        <p class="section-title">支援解析度 (Max FPS)</p>
                                        <div class="res-tags">
                                            {device.supportedResolutions.filter(res => res.maxFps != null && res.width <= 1440 && res.height <= 1920).map(res => (
                                                <span

                                                    classList={{
                                                        'is-running': isCameraRunning()?.cameraId === device.id &&
                                                            isCameraRunning()?.activeArraySize.width === res.width &&
                                                            isCameraRunning()?.activeArraySize.height === res.height,
                                                        'is-selected': openCameraArgs()?.cameraId === device.id &&
                                                            openCameraArgs()?.activeArraySize.width === res.width &&
                                                            openCameraArgs()?.activeArraySize.height === res.height
                                                    }}


                                                    onclick={() => {
                                                        setOpenCameraArgs({
                                                            cameraId: device.id,
                                                            activeArraySize: {
                                                                width: res.width,
                                                                height: res.height,
                                                                fpsRange: {
                                                                    min: res.maxFps!,
                                                                    max: res.maxFps!
                                                                }
                                                            },
                                                        });
                                                    }}
                                                    class="res-tag">
                                                    {res.width}x{res.height}
                                                    <Show when={res.maxFps}>
                                                        <small>({res.maxFps}fps)</small>
                                                    </Show>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            </Show>
            <Show when={currentPlatform() === 'android'}>
                <div
                    class="card"
                    classList={{ 'highlight-blue': isHLPermissionCard() }}
                >
                    <p class="card-title">權限</p>
                    <button onclick={async () => {
                        let permissions = await checkPermissions<Permissions>("camera")
                        setPermissions(permissions);
                        let status = await getBatteryOptimizationStatus();
                        setBatteryStatus({ isIgnoringOptimizations: status.isIgnoringOptimizations, isOptimized: status.isOptimized });
                    }}>重新檢查權限</button>
                    <button
                        ref={el => cameraButtonRef = el}

                        classList={{ 'highlight-blue': isHLCameraButton() }}
                        class={isCameraPermissionGranted() ? 'allow' : 'reject'}
                        disabled={isCameraPermissionGranted()}
                        onclick={async () => {
                            if (permissions()?.camera == 'prompt') {
                                await requestPermissions<{ permissions: ['camera'] }>("camera")
                            } else {
                                await open_app_settings();
                            }

                            let check = await checkPermissions<Permissions>("camera")
                            setPermissions(check);
                        }}>
                        {isCameraPermissionGranted() ? "相機權限已授予(相機使用)" : "請求相機權限(相機使用)"}
                    </button>
                    <button
                        class={isNotificationPermissionGranted() ? 'allow' : 'reject'}
                        disabled={isNotificationPermissionGranted()}
                        onclick={async () => {
                            if (permissions()?.postNotifications == 'prompt') {
                                await requestPermissions<{ permissions: ['postNotifications'] }>("camera")
                            } else {
                                await open_app_settings();
                            }
                            let check = await checkPermissions<Permissions>("camera")
                            setPermissions(check);
                        }
                        }
                    >
                        {isNotificationPermissionGranted() ? "通知權限已授予(前景服務)" : "請求通知權限(前景服務)"}
                    </button>
                    <button
                        class={isBatteryOptimizationIgnored() ? 'allow' : 'reject'}
                        disabled={isBatteryOptimizationIgnored()}
                        onclick={async () => {
                            await requestIgnoreBatteryOptimizations();
                            let status = await getBatteryOptimizationStatus()
                            setBatteryStatus({ isIgnoringOptimizations: status.isIgnoringOptimizations, isOptimized: status.isOptimized });
                        }}
                    >
                        {isBatteryOptimizationIgnored() ? "已忽略電池優化(防止背景執行被關閉)" : "請求忽略電池優化(防止背景執行被關閉)"}
                    </button>
                </div>
            </Show>

            {/* <div class="stream-container"> */}
            <Show when={serverIsRunning()}>

                <div class="card">
                    <p class="card-title">伺服器畫面 (遠端)
                        <button
                            style={{ "margin-left": "8px" }}
                            onclick={() => setPreview({ ...preview(), remote: !preview().remote })}>
                            {preview().remote ? '關閉' : '預覽'}
                        </button>
                    </p>
                    <div class="status-bar" style={{
                        "font-size": "12px",
                        "margin-bottom": "8px",
                        display: preview().remote ? "" : "none",

                    }}>
                        <span>狀態: {streams().remote.status}</span> |
                        <span> 解析度: {streams().remote.res}</span>
                    </div>

                    <div class="video-container" style={{
                        background: "#000",
                        "border-radius": "8px",
                        overflow: "hidden",
                        width: "100%",
                        "aspect-ratio": "4/3",
                        display: preview().remote ? "flex" : "none",
                        "align-items": "center",
                        "justify-content": "center"
                    }}>
                        <canvas
                            ref={canvasRefs.remote}
                            style={{
                                "max-width": "100%",
                                "max-height": "100%",
                                "object-fit": "contain"
                            }}
                        />
                    </div>
                </div>
            </Show>
            <Show when={isCameraRunning() != null && serverIsRunning()}>
                <div class="card">
                    <p class="card-title">伺服器畫面 (本地)
                        <button
                            style={{ "margin-left": "8px" }}
                            onclick={() => setPreview({ ...preview(), local: !preview().local })}
                        >{preview().local ? '關閉' : '預覽'}
                        </button>
                    </p>
                    <div
                        class="status-bar"
                        style={{
                            "font-size": "12px", "margin-bottom": "8px", display: preview().local ? "" : "none",
                        }}
                    >
                        <span>狀態: {streams().local.status}</span> |
                        <span> 解析度: {streams().local.res}</span>
                    </div>

                    <div class="video-container"
                        style={{

                            background: "#000",
                            "border-radius": "8px",
                            overflow: "hidden",
                            width: "100%",
                            "aspect-ratio": "4/3",
                            display: preview().local ? "flex" : "none",
                            "align-items": "center",
                            "justify-content": "center"
                        }}>
                        <canvas
                            ref={canvasRefs.local}
                            style={{
                                "max-width": "100%",
                                "max-height": "100%",
                                "object-fit": "contain"
                            }}
                        />
                    </div>
                </div>
            </Show>

            {/* </div> */}

            <Show when={toastMsg()}>
                <div class="toast-container">
                    <span>{toastMsg()}</span>
                </div>
            </Show>
            <Show when={currentCameraCapabilities() != null}>
                <CameraControlPanel capabilities={currentCameraCapabilities()!} />
            </Show>
        </main >
    );
}

export default App;



export interface Permissions {
    camera: PermissionState;
    postNotifications: PermissionState;
}

