import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type RecordProps,
  type TLShape,
  T,
} from "tldraw";

/**
 * Agent event variant types - each renders differently
 */
export type AgentEventVariant =
  | "system"
  | "thinking"
  | "tool"
  | "tool_done"
  | "message"
  | "done"
  | "error";

// Shape type constant
export const AGENT_EVENT_SHAPE_TYPE = "agent-event" as const;

// Extend tldraw's type system
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [AGENT_EVENT_SHAPE_TYPE]: {
      w: number;
      h: number;
      variant: string;
      label: string;
      detail: string;
    };
  }
}

type IAgentEventShape = TLShape<typeof AGENT_EVENT_SHAPE_TYPE>;

// Variant configuration for styling
const VARIANT_CONFIG: Record<
  AgentEventVariant,
  { icon: string; bg: string; border: string; iconBg: string; labelColor: string }
> = {
  system: {
    icon: "🚀",
    bg: "#f0f4ff",
    border: "#c7d2fe",
    iconBg: "#e0e7ff",
    labelColor: "#4338ca",
  },
  thinking: {
    icon: "💭",
    bg: "#fefce8",
    border: "#fde68a",
    iconBg: "#fef3c7",
    labelColor: "#92400e",
  },
  tool: {
    icon: "🔧",
    bg: "#f0fdf4",
    border: "#86efac",
    iconBg: "#dcfce7",
    labelColor: "#166534",
  },
  tool_done: {
    icon: "✅",
    bg: "#f0fdf4",
    border: "#4ade80",
    iconBg: "#bbf7d0",
    labelColor: "#15803d",
  },
  message: {
    icon: "💬",
    bg: "#faf5ff",
    border: "#d8b4fe",
    iconBg: "#f3e8ff",
    labelColor: "#7e22ce",
  },
  done: {
    icon: "✨",
    bg: "#ecfdf5",
    border: "#6ee7b7",
    iconBg: "#d1fae5",
    labelColor: "#065f46",
  },
  error: {
    icon: "❌",
    bg: "#fef2f2",
    border: "#fca5a5",
    iconBg: "#fee2e2",
    labelColor: "#991b1b",
  },
};

export class AgentEventShapeUtil extends BaseBoxShapeUtil<IAgentEventShape> {
  static override type = AGENT_EVENT_SHAPE_TYPE;
  static override props: RecordProps<IAgentEventShape> = {
    w: T.number,
    h: T.number,
    variant: T.string,
    label: T.string,
    detail: T.string,
  };

  getDefaultProps(): IAgentEventShape["props"] {
    return {
      w: 360,
      h: 64,
      variant: "system",
      label: "",
      detail: "",
    };
  }

  // Display-only shapes
  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  override canBind() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }
  override hideSelectionBoundsFg() {
    return true;
  }

  component(shape: IAgentEventShape) {
    const variant = (shape.props.variant as AgentEventVariant) || "system";
    const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.system;

    return (
      <HTMLContainer>
        <div
          style={{
            width: shape.props.w,
            height: shape.props.h,
            borderRadius: 12,
            border: `1.5px solid ${config.border}`,
            backgroundColor: config.bg,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxSizing: "border-box",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          {/* Icon circle */}
          <div
            style={{
              width: 36,
              height: 36,
              minWidth: 36,
              borderRadius: 10,
              backgroundColor: config.iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            {config.icon}
          </div>

          {/* Text content */}
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: config.labelColor,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shape.props.label}
            </div>
            {shape.props.detail && (
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {shape.props.detail}
              </div>
            )}
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: IAgentEventShape) {
    return (
      <rect
        rx={12}
        ry={12}
        width={shape.props.w}
        height={shape.props.h}
      />
    );
  }
}
