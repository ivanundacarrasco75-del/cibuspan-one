type HeaderProps = {
  title: string;
};

export default function Header({ title }: HeaderProps) {
  return (
    <header
      style={{
        background: "#ffffff",
        padding: "16px 24px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <small style={{ color: "#6b7280" }}>
          Sistema Integral de Producción
        </small>
      </div>

      <div>
        👤 Iván
      </div>
    </header>
  );
}
