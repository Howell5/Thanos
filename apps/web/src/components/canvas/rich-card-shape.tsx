import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLShape } from "tldraw";
import type { Artifact } from "./agent-renderer";

// Shape type constant
export const RICH_CARD_SHAPE_TYPE = "rich-card" as const;

// Extend tldraw's type system
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [RICH_CARD_SHAPE_TYPE]: {
      w: number;
      h: number;
      template: string;
      cardData: string;
      title: string;
    };
  }
}

type IRichCardShape = TLShape<typeof RICH_CARD_SHAPE_TYPE>;

// ─── Inline Styles ──────────────────────────────────────────

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONO_FAMILY = '"SF Mono", "Fira Code", "Consolas", monospace';

const MAX_TABLE_ROWS = 20;

const cardStyles = {
  frame: (w: number, h: number): React.CSSProperties => ({
    width: w,
    height: h,
    fontFamily: FONT_FAMILY,
    borderRadius: 12,
    border: "1.5px solid #e2e8f0",
    backgroundColor: "#ffffff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  } as React.CSSProperties,
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1e293b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  } as React.CSSProperties,
  templateBadge: (template: string): React.CSSProperties => ({
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "2px 6px",
    borderRadius: 4,
    backgroundColor: template === "text" ? "#f0f4ff" : template === "table" ? "#f0fdf4" : "#faf5ff",
    color: template === "text" ? "#4338ca" : template === "table" ? "#166534" : "#7e22ce",
    flexShrink: 0,
    marginLeft: 8,
  }),
  body: {
    flex: 1,
    overflow: "auto",
    padding: "10px 14px",
  } as React.CSSProperties,
} as const;

// ─── Template Renderers ─────────────────────────────────────

function TextTemplate({ artifact }: { artifact: Extract<Artifact, { type: "text" }> }) {
  const isCode =
    artifact.format === "markdown" ||
    artifact.content.includes("```") ||
    /^\s{2,}/m.test(artifact.content);

  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.6,
        color: "#334155",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: isCode ? MONO_FAMILY : FONT_FAMILY,
      }}
    >
      {artifact.content}
    </div>
  );
}

function TableTemplate({ artifact }: { artifact: Extract<Artifact, { type: "table" }> }) {
  const visibleRows = artifact.rows.slice(0, MAX_TABLE_ROWS);
  const hiddenCount = artifact.rows.length - visibleRows.length;

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 11,
        }}
      >
        <thead>
          <tr>
            {artifact.headers.map((header) => (
              <th
                key={header}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "2px solid #e2e8f0",
                  fontWeight: 600,
                  color: "#475569",
                  whiteSpace: "nowrap",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => (
            <tr
              key={`row-${ri}-${row[0] ?? ""}`}
              style={{
                backgroundColor: ri % 2 === 0 ? "transparent" : "#f8fafc",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={`cell-${ri}-${ci}-${cell}`}
                  style={{
                    padding: "5px 8px",
                    borderBottom: "1px solid #f1f5f9",
                    color: "#334155",
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            padding: "6px 8px",
            textAlign: "center",
          }}
        >
          ... {hiddenCount} more row{hiddenCount > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function FileTemplate({ artifact }: { artifact: Extract<Artifact, { type: "file" }> }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        📄
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#1e293b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {artifact.name}
        </div>
        {artifact.mimeType && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{artifact.mimeType}</div>
        )}
      </div>
    </div>
  );
}

function UnknownTemplate({ raw }: { raw: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: "#475569",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: MONO_FAMILY,
      }}
    >
      {raw}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

function RichCardComponent({ shape }: { shape: IRichCardShape }) {
  const { w, h, template, cardData, title } = shape.props;

  let artifact: Artifact;
  try {
    artifact = JSON.parse(cardData);
  } catch {
    artifact = { type: "unknown", raw: cardData };
  }

  return (
    <HTMLContainer>
      <div style={cardStyles.frame(w, h)}>
        {/* Header */}
        <div style={cardStyles.header}>
          <span style={cardStyles.headerTitle}>{title}</span>
          <span style={cardStyles.templateBadge(template)}>{template}</span>
        </div>

        {/* Body — template-specific rendering */}
        <div style={cardStyles.body}>
          {artifact.type === "text" && <TextTemplate artifact={artifact} />}
          {artifact.type === "table" && <TableTemplate artifact={artifact} />}
          {artifact.type === "file" && <FileTemplate artifact={artifact} />}
          {artifact.type === "unknown" && <UnknownTemplate raw={artifact.raw} />}
        </div>
      </div>
    </HTMLContainer>
  );
}

// ─── Shape Util ─────────────────────────────────────────────

export class RichCardShapeUtil extends BaseBoxShapeUtil<IRichCardShape> {
  static override type = RICH_CARD_SHAPE_TYPE;
  static override props: RecordProps<IRichCardShape> = {
    w: T.number,
    h: T.number,
    template: T.string,
    cardData: T.string,
    title: T.string,
  };

  getDefaultProps(): IRichCardShape["props"] {
    return {
      w: 400,
      h: 300,
      template: "text",
      cardData: "{}",
      title: "Output",
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

  component(shape: IRichCardShape) {
    return <RichCardComponent shape={shape} />;
  }

  indicator(shape: IRichCardShape) {
    return <rect rx={12} ry={12} width={shape.props.w} height={shape.props.h} />;
  }
}
