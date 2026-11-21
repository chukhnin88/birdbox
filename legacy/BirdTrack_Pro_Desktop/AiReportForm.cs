namespace BirdTrack;

public sealed class AiReportForm : Form
{
    public AiReportForm(IReadOnlyList<AiFinding> findings, int points, int rings)
    {
        Text = "BirdTrack AI — анализ GPS";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(900, 590);
        MinimumSize = new Size(720, 450);
        BackColor = Color.FromArgb(7, 18, 38);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 10);

        var header = new Panel { Dock = DockStyle.Top, Height = 104, BackColor = Color.FromArgb(17, 35, 62), Padding = new Padding(18) };
        header.Controls.Add(new Label { Text = "BIRDTRACK AI", AutoSize = true, Font = new Font("Segoe UI", 20, FontStyle.Bold), ForeColor = Color.MediumPurple, Location = new Point(18, 12) });
        header.Controls.Add(new Label { Text = $"Локальный анализ • без интернета     История: {points:N0} точек • колец: {rings} • аномалий: {findings.Count}", AutoSize = true, ForeColor = Color.LightSteelBlue, Location = new Point(22, 58) });
        Controls.Add(header);

        var grid = new DataGridView { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AutoGenerateColumns = false,
            DataSource = findings.ToList(), BackgroundColor = Color.FromArgb(17, 35, 62), BorderStyle = BorderStyle.None,
            RowHeadersVisible = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            EnableHeadersVisualStyles = false, ColumnHeadersDefaultCellStyle = { BackColor = Color.FromArgb(29, 54, 85), ForeColor = Color.LightBlue },
            DefaultCellStyle = { BackColor = Color.FromArgb(17, 35, 62), ForeColor = Color.White, SelectionBackColor = Color.FromArgb(55, 68, 105) },
            AlternatingRowsDefaultCellStyle = { BackColor = Color.FromArgb(20, 42, 70) } };
        grid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = nameof(AiFinding.Time), HeaderText = "ВРЕМЯ", FillWeight = 18, DefaultCellStyle = { Format = "dd.MM HH:mm:ss" } });
        grid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = nameof(AiFinding.Ring), HeaderText = "КОЛЬЦО", FillWeight = 12 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = nameof(AiFinding.Severity), HeaderText = "УРОВЕНЬ", FillWeight = 14 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = nameof(AiFinding.Reason), HeaderText = "ОБЪЯСНЕНИЕ", FillWeight = 56 });
        Controls.Add(grid);

        var footer = new Label { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(14), ForeColor = Color.LightSteelBlue,
            Text = findings.Count == 0 ? "Аномалий пока нет. По мере поступления GPS-точек алгоритм будет накапливать индивидуальную историю." :
            "Проверяйте предупреждения: резкие скачки могут быть вызваны плохим GPS-приёмом, а не реальным перемещением птицы." };
        Controls.Add(footer);
    }
}
