import { createEffect, createSignal, on, Show } from "solid-js";
import { CameraCapabilities, setExposureCompensation, setLinearZoom, setTorch, } from "tauri-plugin-camera";

interface CameraControlPanelProps {
    capabilities: CameraCapabilities;
}

export function CameraControlPanel(props: CameraControlPanelProps) {
    const caps = () => props.capabilities;
    // const [zoomRatioState, setZoomRatioState] = createSignal(0);
    console.log(caps());

    const [linearZoomState, setLinearZoomState] = createSignal(0);
    const [torchState, setTorchState] = createSignal(caps()?.torchState ? true : false);
    const [exposureCompensationState, setExposureCompensationState] = createSignal(0);
    // 修正後的縮放處理函數

    const handleLinearZoomChange = (e: InputEvent & { target: HTMLInputElement }) => {
        setLinearZoomState(parseFloat(e.target.value))
    };

    const handleExposureChange = (e: InputEvent & { target: HTMLInputElement }) => {
        setExposureCompensationState(parseInt(e.target.value));
    };



    // 1. 只有當 linearZoomState 改變時才執行，跳過初始第一次
    createEffect(on(linearZoomState, (lz) => {
        console.log("線性縮放已改變:", lz);
        setLinearZoom({ value: lz });
    }, { defer: true }));

    // 2. 只有當 torchState 改變時才執行，跳過初始第一次
    createEffect(on(torchState, (ts) => {
        console.log("手電筒狀態已改變:", ts);
        setTorch({ enable: ts });
    }, { defer: true }));

    // 3. 只有當 exposureCompensationState 改變時才執行，跳過初始第一次
    createEffect(on(exposureCompensationState, (ec) => {
        console.log("曝光補償已改變:", ec);
        setExposureCompensation({ index: ec });
    }, { defer: true }));


    return (
        <Show when={caps()}>
            <div class="card" >
                <p class="card-title" style={{ "font-weight": "bold" }}>相機控制面板</p>

                <div class="control-group">
                    <div style={{ "display": "flex", "justify-content": "between" }}>
                        <label>Linear Zoom</label>
                        <span>{linearZoomState()}x</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={linearZoomState()}
                        onInput={handleLinearZoomChange}

                    />
                    <div style={{ "display": "flex", "justify-content": "space-between", "font-size": "10px" }}>
                        <span>0</span>
                        <span>1</span>
                    </div>
                </div>



                <div class="control-group">
                    <div style={{ "display": "flex", "justify-content": "between" }}>
                        <label>曝光 </label>
                        <span>{exposureCompensationState()}</span>
                    </div>
                    <input
                        type="range"
                        min={caps()!.exposureMin}
                        max={caps()!.exposureMax}
                        step="1"
                        value={exposureCompensationState()}
                        onInput={handleExposureChange}
                    />
                </div>


                <div>
                    <div style={{ "display": "flex", "align-items": "center", "gap": "8px" }}>
                        <button
                            onClick={() => {
                                setTorchState(prev => !prev);
                            }}
                        >
                            {torchState() ? "關閉手電筒" : "開啟手電筒"}
                        </button>
                    </div>


                </div>
            </div>
        </Show>
    );
}