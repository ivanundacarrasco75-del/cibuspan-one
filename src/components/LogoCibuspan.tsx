export default function LogoCibuspan({ ancho = 212 }: { ancho?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}cibuspan-one-logo.png`}
      alt="CIBUSPAN ONE"
      width={2172}
      height={724}
      style={{ display: "block", width: ancho, maxWidth: "100%", height: "auto" }}
    />
  )
}
