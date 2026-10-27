"""Tutorial PDF: duración, calendario lun-sáb y edición del contrato."""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent
CAPTURAS = ROOT / "tutorial-capturas"
OUT = ROOT / "tutorial-contrato-talonario.pdf"

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))

INK = HexColor("#111111")
MUTED = HexColor("#525252")
LINE = HexColor("#d4d4d4")
ACCENT = HexColor("#0f172a")

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        "TTitle",
        fontName="Arial-Bold",
        fontSize=18,
        leading=22,
        textColor=ACCENT,
        spaceAfter=8,
        alignment=TA_LEFT,
    )
)
styles.add(
    ParagraphStyle(
        "TSub",
        fontName="Arial",
        fontSize=10,
        leading=14,
        textColor=MUTED,
        spaceAfter=16,
    )
)
styles.add(
    ParagraphStyle(
        "TH",
        fontName="Arial-Bold",
        fontSize=13,
        leading=17,
        textColor=ACCENT,
        spaceBefore=14,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        "TB",
        fontName="Arial",
        fontSize=10,
        leading=14,
        textColor=INK,
        alignment=TA_JUSTIFY,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        "TCap",
        fontName="Arial",
        fontSize=9,
        leading=12,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceBefore=4,
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        "TLi",
        fontName="Arial",
        fontSize=10,
        leading=14,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        "TCell",
        fontName="Arial",
        fontSize=8.5,
        leading=11,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        "TCellH",
        fontName="Arial-Bold",
        fontSize=8.5,
        leading=11,
        textColor=ACCENT,
    )
)


def fig(name: str, caption: str, width=16.2 * cm):
    path = CAPTURAS / name
    img = Image(str(path), width=width, height=width * 0.62, kind="proportional")
    img.hAlign = "CENTER"
    return KeepTogether([img, Paragraph(caption, styles["TCap"])])


def bullet(items):
    return ListFlowable(
        [ListItem(Paragraph(x, styles["TLi"]), leftIndent=8) for x in items],
        bulletType="bullet",
        leftIndent=16,
        spaceAfter=8,
    )


def table(headers, rows, col_widths=None):
    data = [[Paragraph(h, styles["TCellH"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(c, styles["TCell"]) for c in row])
    usable = 16.4 * cm
    widths = col_widths or [usable / len(headers)] * len(headers)
    t = Table(data, colWidths=widths)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#f4f4f5")),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Arial", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2 * cm, 1.2 * cm, "CIM · Tutorial contrato y talonario lun–sáb")
    canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, str(doc.page))
    canvas.restoreState()


story = []
story.append(Paragraph("Asignar moto, plazo y frecuencia lun–sáb", styles["TTitle"]))
story.append(
    Paragraph(
        "Guía para el equipo. Cómo asignar placa, elegir frecuencia y fijar cuánto dura el crédito "
        "(un año, ocho meses, seis meses, un año y medio). Estos clientes no pagan cuota adelantada: "
        "el primer pago es inicial + visita. Cliente de prueba: cédula 1099990001, ficha /clientes/6.",
        styles["TSub"],
    )
)

story.append(Paragraph("Para qué sirve", styles["TH"]))
story.append(
    Paragraph(
        "Al asignar la moto tú decides tres cosas aparte: la frecuencia (diario, semanal, quincenal, "
        "mensual), cuántas cuotas dura el contrato, y cuánto dan de inicial. La inicial no acorta ni "
        "alarga el crédito sola. Las cuotas nuevas se pagan de lunes a sábado; el domingo no cobra. "
        "Después puedes corregir cliente, frecuencia, número de cuotas y cuota diaria: se regeneran "
        "el PDF del contrato y las cuotas pendientes del talonario. Los contratos viejos siguen con "
        "el calendario de 7/15/30 hasta que se asignen de nuevo o se editen a propósito.",
        styles["TB"],
    )
)

story.append(Paragraph("Dónde está cada campo (paso Moto)", styles["TH"]))
story.append(
    bullet(
        [
            "<b>Moto</b>: modelo y color del catálogo.",
            "<b>Frecuencia</b>: diario, semanal, quincenal o mensual. Lun–sáb: 1 / 6 / 12 / 24 días de cobro por cuota. Semanal de $10.000/día = $60.000, no $70.000.",
            "<b>Número de cuotas</b>: el plazo. Si no lo tocas, arranca en un año. Cámbialo para 8 meses, 6 meses, año y medio, etc.",
            "<b>Cuota inicial</b>: lo que dan de entrada. Puede ser $0 o un valor grande. No cambia el número de cuotas.",
            "<b>Cuota diaria</b>: base de cada periodo.",
            "<b>Visita domiciliaria</b>: valor de la visita (puede ser $0).",
            "<b>Placa y chasis</b>: con ambos se genera el contrato. La placa es opcional hasta que la tengas; el chasis es obligatorio para firmar.",
            "<b>Cuota adelantada</b>: estos clientes no la pagan. Déjala en $0.",
        ]
    )
)
story.append(
    Paragraph(
        "Después, en Contrato digital → Editar, se cambian nombre y datos del cliente, frecuencia, "
        "cuotas y cuota diaria. No se cambia la moto ni la placa.",
        styles["TB"],
    )
)

story.append(Paragraph("De meses a número de cuotas", styles["TH"]))
story.append(
    Paragraph(
        "El campo es número de cuotas, no un menú de meses. Usa esta tabla lun–sáb y redondea si hace falta:",
        styles["TB"],
    )
)
story.append(
    table(
        ["Plazo", "Diario", "Semanal", "Quincenal", "Mensual"],
        [
            ["6 meses", "156", "26", "13", "7"],
            ["8 meses", "208", "35", "17", "9"],
            ["1 año (valor inicial)", "312", "52", "26", "13"],
            ["1 año y medio", "468", "78", "39", "20"],
        ],
    )
)
story.append(Spacer(1, 8))
story.append(
    Paragraph(
        "Ejemplos: semanal a 8 meses → 35 cuotas. Diario a 6 meses → 156. Mensual a un año y medio → 20. "
        "Si el cliente da una inicial más grande, subes solo «Cuota inicial»; el plazo lo sigues poniendo tú.",
        styles["TB"],
    )
)

story.append(Paragraph("1. Asignar moto, placa y frecuencia", styles["TH"]))
story.append(
    Paragraph(
        "En la ficha, con el crédito aceptado: elige la moto, la frecuencia, el número de cuotas según "
        "el plazo, la inicial, la diaria y la visita. Placa y chasis. Cuota adelantada en $0. "
        "La vista previa muestra valor de cada cuota, cuántas son, y primera y última fecha; ningún "
        "vencimiento cae en domingo. Guardar moto y generar contrato.",
        styles["TB"],
    )
)
story.append(fig("01-asignar-moto-form.png", "Figura 1. Asignación: frecuencia lun–sáb, número de cuotas, placa y chasis."))
story.append(
    fig(
        "02-asignar-preview-60mil.png",
        "Figura 2. Vista previa del plazo y de cada cuota. En estos clientes la adelantada va en $0; el primer pago es inicial + visita.",
    )
)

story.append(Paragraph("2. Firmar el contrato", styles["TH"]))
story.append(
    Paragraph(
        "Con placa y chasis el paso Contrato queda listo. Se envía el link /contrato/{id}. El cliente "
        "revisa sus datos, la moto, la frecuencia y el valor de cada cuota, acepta y firma. El PDF "
        "sale con ese número de cuotas y el texto de lunes a sábado.",
        styles["TB"],
    )
)
story.append(fig("03-contrato-listo-firmar.png", "Figura 3. Moto y placa asignadas; contrato listo para enviar."))
story.append(fig("04-firmar-datos-cuota-semanal.png", "Figura 4. El cliente ve moto, placa, chasis y valor de la cuota periódica."))
story.append(fig("06-firma-pad.png", "Figura 5. Firma en el recuadro."))
story.append(fig("07-contrato-firmado.png", "Figura 6. Contrato firmado."))

story.append(PageBreak())
story.append(Paragraph("3. Primer pago (sin adelantada) y talonario", styles["TH"]))
story.append(
    Paragraph(
        "Se cobra inicial + visita. No hay cuota adelantada. Al confirmar, la moto queda lista para "
        "retiro y nace el talonario: tantas filas como cuotas, del lunes al sábado, con el monto del "
        "periodo. Todas empiezan pendientes; se van marcando pagadas cuando el cliente paga cada cuota.",
        styles["TB"],
    )
)
story.append(
    fig(
        "09-talonario-8-semanales.png",
        "Figura 7. Talonario según frecuencia y número de cuotas. Sin domingos. Sin adelantada, ninguna fila nace pagada.",
    )
)

story.append(Paragraph("4. Cambiar el plazo después (año → 8 meses, etc.)", styles["TH"]))
story.append(
    Paragraph(
        "En Contrato digital → Editar puedes pasar de un año a 8 meses (por ejemplo semanal 52 → 35), "
        "a 6 meses, o a un año y medio. También puedes cambiar de semanal a diario u otra frecuencia. "
        "Al guardar se actualizan los datos del cliente, el PDF firmado y las cuotas pendientes. "
        "Las ya pagadas no se tocan. Si el nuevo número es menor o igual a las ya aplicadas, el cambio se rechaza.",
        styles["TB"],
    )
)
story.append(fig("11-nombre-editado.png", "Figura 8. Después de editar: datos del cliente y frecuencia actualizados."))
story.append(
    fig(
        "10-talonario-diario-10.png",
        "Figura 9. Talonario rehecho al cambiar frecuencia o número de cuotas. El domingo no aparece.",
    )
)

story.append(Paragraph("Qué debe decir el PDF del contrato", styles["TH"]))
story.append(
    Paragraph(
        "Nombre del contratante, moto, placa y chasis, número de cuotas y valor de cada una, "
        "y que el saldo se paga de lunes a sábado a las 5 p.m. de cada día de cobro.",
        styles["TB"],
    )
)

story.append(Paragraph("Cómo repetir", styles["TH"]))
story.append(
    bullet(
        [
            "Administración → Clientes → cédula 1099990001 o /clientes/6.",
            "Caso limpio: otra cédula, aprobar crédito, asignar moto con adelantada en $0, placa, frecuencia y el número de cuotas del plazo.",
            "Contratos anteriores siguen con 7/15/30 salvo que se editen frecuencia, cuotas o cuota diaria.",
        ]
    )
)

doc = SimpleDocTemplate(
    str(OUT),
    pagesize=A4,
    leftMargin=1.8 * cm,
    rightMargin=1.8 * cm,
    topMargin=1.6 * cm,
    bottomMargin=1.8 * cm,
    title="Tutorial contrato y talonario lun–sáb",
    author="CIM",
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
