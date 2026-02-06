import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLShape } from "tldraw";

// Shape type constant
export const VIDEO_SHAPE_TYPE = "canvas-video" as const;

// Extend tldraw's type system
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [VIDEO_SHAPE_TYPE]: {
      w: number;
      h: number;
      videoUrl: string;
      fileName: string;
    };
  }
}

type IVideoShape = TLShape<typeof VIDEO_SHAPE_TYPE>;

// ─── Component ──────────────────────────────────────────────

function VideoPlayer({ src }: { src: string }) {
  return (
    // biome-ignore lint/a11y/useMediaCaption: user-uploaded videos have no caption tracks
    <video
      src={src}
      controls
      preload="metadata"
      style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }}
    />
  );
}

function VideoComponent({ shape }: { shape: IVideoShape }) {
  const { w, h, videoUrl, fileName } = shape.props;

  return (
    <HTMLContainer>
      <div
        style={{
          width: w,
          height: h,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {videoUrl ? (
          <VideoPlayer src={videoUrl} />
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: 16 }}>
            {fileName || "Video"}
          </div>
        )}
        {fileName && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: "4px 8px",
              background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {fileName}
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}

// ─── Shape Util ─────────────────────────────────────────────

export class VideoShapeUtil extends BaseBoxShapeUtil<IVideoShape> {
  static override type = VIDEO_SHAPE_TYPE;
  static override props: RecordProps<IVideoShape> = {
    w: T.number,
    h: T.number,
    videoUrl: T.string,
    fileName: T.string,
  };

  getDefaultProps(): IVideoShape["props"] {
    return {
      w: 320,
      h: 180,
      videoUrl: "",
      fileName: "",
    };
  }

  override canEdit() {
    return false;
  }
  override canResize() {
    return true;
  }
  override canBind() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }

  component(shape: IVideoShape) {
    return <VideoComponent shape={shape} />;
  }

  indicator(shape: IVideoShape) {
    return <rect rx={8} ry={8} width={shape.props.w} height={shape.props.h} />;
  }
}
