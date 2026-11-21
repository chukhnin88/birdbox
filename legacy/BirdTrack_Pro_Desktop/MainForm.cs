using System.ComponentModel;
using System.Text.Json;
using System.Drawing.Drawing2D;
using System.Net;
using System.Text;
using Microsoft.Web.WebView2.WinForms;
namespace BirdTrack;
public class Bird { public string Ring{get;set;}=""; public string Species{get;set;}=""; public string Device{get;set;}="GPS-трекер"; public string Status{get;set;}="Активно"; public string Place{get;set;}=""; public DateTime Seen{get;set;}=DateTime.Now; public int Battery{get;set;}=100; public double Lat{get;set;}=52.52; public double Lon{get;set;}=13.405; public bool Tracking{get;set;}=false; public double? Heading{get;set;} }
public sealed class MainForm:Form {
 BindingList<Bird> data=new(); DataGridView table=new(); TextBox search=new(); MapPanel map=new(); WebView2 browserMap=new(); bool realMapReady=false; double? pendingLat,pendingLon,pendingAccuracy; Label total=new(),active=new(),alerts=new(),chosen=new();
 Label gpsStatus=new(), gpsCoords=new(), gpsAccuracy=new(), gpsTime=new();
 HttpListener? gpsListener; CancellationTokenSource? gpsCts;
 readonly GpsAnomalyEngine ai = new();
 readonly List<AiFinding> aiFindings = new();
 readonly Dictionary<string,BirdSim> sims=new(StringComparer.OrdinalIgnoreCase);
 readonly System.Windows.Forms.Timer simTimer=new(){Interval=1000};
 const double SimMinutesPerTick=5; int tickNo;
 static readonly HttpClient http=MakeHttp();
 string historyFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BirdTrack","gps-history.json");
 string findingsFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BirdTrack","ai-findings.json");
 Label aiStatus = new();
 string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BirdTrack","birds.json");
 Color bg=Color.FromArgb(7,18,38), panel=Color.FromArgb(17,35,62), cyan=Color.FromArgb(63,221,222);
 public MainForm(){Text="BirdTrack Pro — мониторинг птиц"; Size=new Size(1450,850); MinimumSize=new Size(1100,700); StartPosition=FormStartPosition.CenterScreen; BackColor=bg; ForeColor=Color.White; Font=new Font("Segoe UI",10); Build(); LoadData(); ai.Load(historyFile); LoadAiFindings(); RefreshTable(); InitializeRealMap(); StartGpsListener(); InitSim();}
 void Build(){
 var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(18),BackColor=bg}; root.RowStyles.Add(new(SizeType.Absolute,75));root.RowStyles.Add(new(SizeType.Absolute,98));root.RowStyles.Add(new(SizeType.Percent,100));Controls.Add(root);
 var head=new Panel{Dock=DockStyle.Fill,BackColor=bg};head.Controls.Add(new Label{Text="BIRDTRACK",Font=new Font("Segoe UI",25,FontStyle.Bold),ForeColor=Color.White,AutoSize=true,Location=new Point(4,0)});head.Controls.Add(new Label{Text="ПАНЕЛЬ МОНИТОРИНГА GPS-КОЛЕЦ И МИГРАЦИИ ПТИЦ",ForeColor=cyan,Font=new Font("Segoe UI",9,FontStyle.Bold),AutoSize=true,Location=new Point(8,46)});head.Controls.Add(new Label{Text="● GPS ПРИЁМНИК",ForeColor=Color.LightGreen,AutoSize=true,Location=new Point(1100,20)});root.Controls.Add(head,0,0);
 var stats=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,BackColor=bg};for(int i=0;i<4;i++)stats.ColumnStyles.Add(new(SizeType.Percent,25));
 stats.Controls.Add(Card("ПТИЦ В БАЗЕ",total,cyan),0,0);stats.Controls.Add(Card("GPS АКТИВНЫ",active,Color.LightGreen),1,0);stats.Controls.Add(Card("ТРЕБУЮТ ВНИМАНИЯ",alerts,Color.Orange),2,0);stats.Controls.Add(Card("ВЫБРАННОЕ КОЛЬЦО",chosen,Color.Plum),3,0);root.Controls.Add(stats,0,1);
 var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,BackColor=bg};body.ColumnStyles.Add(new(SizeType.Percent,58));body.ColumnStyles.Add(new(SizeType.Percent,42));root.Controls.Add(body,0,2);
 var left=new Panel{Dock=DockStyle.Fill,BackColor=panel,Padding=new Padding(14),Margin=new Padding(0,0,9,0)};body.Controls.Add(left,0,0);
 left.Controls.Add(new Label{Text="КОЛЬЦА И НАБЛЮДЕНИЯ",AutoSize=true,Font=new Font("Segoe UI",13,FontStyle.Bold),Location=new Point(14,12)});
 search.SetBounds(14,47,300,30);search.BackColor=bg;search.ForeColor=Color.White;search.BorderStyle=BorderStyle.FixedSingle;search.PlaceholderText="Поиск по кольцу, виду, статусу…";search.TextChanged+=(_,_)=>RefreshTable();left.Controls.Add(search);
 var bar=new FlowLayoutPanel{Location=new Point(14,86),Height=40,Width=700,Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right,WrapContents=false,AutoScroll=true,BackColor=panel};
 bar.Controls.Add(Btn("+ Добавить",Color.Teal,(_,_)=>Add(),90));bar.Controls.Add(Btn("Редактировать",Color.SteelBlue,(_,_)=>Edit(),100));bar.Controls.Add(Btn("Удалить",Color.Firebrick,(_,_)=>Delete(),80));bar.Controls.Add(Btn("Обновить GPS",Color.DarkGoldenrod,(_,_)=>UpdateGps(),100));bar.Controls.Add(Btn("Экспорт CSV",Color.SlateGray,(_,_)=>Export(),95));bar.Controls.Add(Btn("AI-анализ",Color.MediumPurple,(_,_)=>ShowAiReport(),95));bar.Controls.Add(Btn("Трекер",Color.SeaGreen,(_,_)=>ToggleTracker(),95));left.Controls.Add(bar);
 table.SetBounds(14,133,650,450);table.Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;table.ReadOnly=true;table.AllowUserToAddRows=false;table.MultiSelect=false;table.SelectionMode=DataGridViewSelectionMode.FullRowSelect;table.AutoGenerateColumns=false;table.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;table.RowHeadersVisible=false;table.BackgroundColor=panel;table.BorderStyle=BorderStyle.None;table.EnableHeadersVisualStyles=false;table.ColumnHeadersDefaultCellStyle.BackColor=Color.FromArgb(29,54,85);table.ColumnHeadersDefaultCellStyle.ForeColor=Color.LightBlue;table.DefaultCellStyle.BackColor=panel;table.DefaultCellStyle.ForeColor=Color.White;table.DefaultCellStyle.SelectionBackColor=Color.FromArgb(34,78,105);table.AlternatingRowsDefaultCellStyle.BackColor=Color.FromArgb(20,42,70);table.ColumnHeadersHeight=34;table.RowTemplate.Height=34;
 Col("Ring","КОЛЬЦО",70);Col("Species","ВИД ПТИЦЫ",110);Col("Status","СТАТУС",100);Col("Battery","ЗАРЯД %",65);Col("Seen","ПОСЛЕДНИЙ СИГНАЛ",130,"dd.MM HH:mm");table.SelectionChanged+=(_,_)=>{if(table.CurrentRow?.DataBoundItem is Bird b){chosen.Text=b.Ring;map.Selected=b.Ring;map.Invalidate();}};left.Controls.Add(table);
 var right=new Panel{Dock=DockStyle.Fill,BackColor=panel,Padding=new Padding(14),Margin=new Padding(9,0,0,0)};body.Controls.Add(right,1,0);
 right.Controls.Add(new Label{Text="МОЁ МЕСТОПОЛОЖЕНИЕ / GPS",AutoSize=true,Font=new Font("Segoe UI",13,FontStyle.Bold),Location=new Point(14,12)});
 gpsStatus.SetBounds(16,40,490,20);gpsStatus.ForeColor=Color.Orange;gpsStatus.Text="Ожидание GPS-данных • порт 8766";gpsStatus.Font=new Font("Segoe UI",9,FontStyle.Bold);right.Controls.Add(gpsStatus);
 gpsCoords.SetBounds(16,61,490,24);gpsCoords.Text="Широта: —     Долгота: —";gpsCoords.ForeColor=Color.White;gpsCoords.Font=new Font("Segoe UI",10,FontStyle.Bold);right.Controls.Add(gpsCoords);
 gpsAccuracy.SetBounds(16,84,490,18);gpsAccuracy.Text="Точность: —";gpsAccuracy.ForeColor=Color.LightSteelBlue;right.Controls.Add(gpsAccuracy);
 gpsTime.SetBounds(16,102,490,18);gpsTime.Text="Последнее обновление: —";gpsTime.ForeColor=Color.LightSteelBlue;right.Controls.Add(gpsTime);
 aiStatus.SetBounds(16,120,480,18);aiStatus.Text="AI: локальный анализ готов";aiStatus.ForeColor=Color.MediumPurple;right.Controls.Add(aiStatus);
 browserMap.SetBounds(14,145,500,270);browserMap.Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;browserMap.DefaultBackgroundColor=Color.FromArgb(6,21,41);right.Controls.Add(browserMap);
 right.Controls.Add(new Label{Text="КАРТА • Яндекс Карты",AutoSize=true,Font=new Font("Segoe UI",11,FontStyle.Bold),ForeColor=cyan,Location=new Point(14,430),Anchor=AnchorStyles.Bottom|AnchorStyles.Left});
 right.Controls.Add(new Label{Text=GpsHelpText(),AutoSize=false,Size=new Size(480,125),Location=new Point(16,458),Anchor=AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right,ForeColor=Color.LightSteelBlue,BackColor=panel,Font=new Font("Segoe UI",9)});
 }
 const string RealMapHtml = """
<!doctype html>
<html lang='ru'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>
<style>html,body,#map{height:100%;width:100%;margin:0;background:#061529;font-family:Segoe UI,Arial,sans-serif}.msg{padding:16px;color:#fff;font-size:13px;line-height:1.5}</style>
<script src='https://api-maps.yandex.ru/2.1/?apikey=YOUR_YANDEX_MAPS_API_KEY&lang=ru_RU'></script>
</head>
<body><div id='map'></div><script>
let map=null,marker=null,circle=null,pending=null;
function showMsg(t){document.getElementById('map').innerHTML='<div class="msg">'+t+'</div>';}
window.setGps=function(lat,lon,acc){
  if(!map){pending=[lat,lon,acc];return;}
  const p=[lat,lon];
  if(!marker){marker=new ymaps.Placemark(p,{balloonContent:'Моё местоположение'},{preset:'islands#redCircleDotIcon'});map.geoObjects.add(marker);}
  else marker.geometry.setCoordinates(p);
  marker.properties.set('balloonContent','Моё местоположение<br>'+lat.toFixed(6)+', '+lon.toFixed(6));
  if(acc>0){
    if(!circle){circle=new ymaps.Circle([p,acc],{},{fillColor:'#20c99733',strokeColor:'#20c997',strokeWidth:2});map.geoObjects.add(circle);}
    else{circle.geometry.setCoordinates(p);circle.geometry.setRadius(acc);}
  }
  map.setCenter(p,Math.max(map.getZoom(),15),{duration:300});
};
const birds={},queue=[];
function whenReady(f){if(map)f();else if(queue.length<2000)queue.push(f);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
window.setBird=function(ring,label,lat,lon,trail){whenReady(function(){
  const p=[lat,lon];let e=birds[ring];
  if(!e){
    e={coords:[],
       line:new ymaps.Polyline([p,p],{},{strokeColor:'#3fddde',strokeWidth:3,strokeOpacity:0.85}),
       pm:new ymaps.Placemark(p,{iconCaption:label,balloonContent:esc(label)},{preset:'islands#darkBlueCircleDotIconWithCaption'})};
    map.geoObjects.add(e.line);map.geoObjects.add(e.pm);birds[ring]=e;
  }
  if(trail&&trail.length)e.coords=trail.slice();
  e.coords.push(p);
  if(e.coords.length>600)e.coords.splice(0,e.coords.length-600);
  e.pm.geometry.setCoordinates(p);
  e.pm.properties.set({iconCaption:label,balloonContent:esc(label)+'<br>'+lat.toFixed(5)+', '+lon.toFixed(5)});
  e.line.geometry.setCoordinates(e.coords.length>1?e.coords:[p,p]);
});};
window.focusBird=function(ring,zoom){whenReady(function(){const e=birds[ring];if(e)map.setCenter(e.pm.geometry.getCoordinates(),zoom||map.getZoom(),{duration:300});});};
window.removeBird=function(ring){whenReady(function(){const e=birds[ring];if(e){map.geoObjects.remove(e.pm);map.geoObjects.remove(e.line);delete birds[ring];}});};
window.fitMap=function(){if(map)map.container.fitToViewport();};
if(typeof ymaps==='undefined'){
  showMsg('Не удалось загрузить Яндекс Карты.<br>Проверьте интернет и API-ключ.');
}else{
  ymaps.ready(function(){
    map=new ymaps.Map('map',{center:[55.75,37.62],zoom:5,controls:['zoomControl','typeSelector','fullscreenControl']});
    if(pending){window.setGps(pending[0],pending[1],pending[2]);pending=null;}
    queue.splice(0).forEach(function(f){f();});
  });
}
window.addEventListener('resize',()=>setTimeout(window.fitMap,100));
</script></body></html>
""";
 const string NoKeyHtml = """
<!doctype html>
<html lang='ru'><head><meta charset='utf-8'>
<style>html,body{height:100%;margin:0;background:#061529;color:#fff;font-family:Segoe UI,Arial,sans-serif}.msg{padding:16px;font-size:13px;line-height:1.6}b{color:#3fddde}</style></head>
<body><div class='msg'><b>Нужен API-ключ Яндекс Карт</b><br>
1. Откройте developer.tech.yandex.ru → «Получить ключ» → сервис «JavaScript API».<br>
2. Сохраните ключ одной строкой в файл:<br><b>KEYPATH</b><br>
3. Перезапустите BirdTrack (ключ активируется в течение ~15 минут).</div></body></html>
""";
 async void InitializeRealMap(){
  try{
   await browserMap.EnsureCoreWebView2Async();
   browserMap.NavigationCompleted += (_,e) => {
    realMapReady=true;
    browserMap.CoreWebView2?.ExecuteScriptAsync("setTimeout(()=>{if(window.fitMap)window.fitMap();},250);");
    if(pendingLat.HasValue&&pendingLon.HasValue) UpdateRealMap(pendingLat.Value,pendingLon.Value,pendingAccuracy??0);
    foreach(var sm in sims.Values.ToList()){var bb=data.FirstOrDefault(x=>x.Ring.Equals(sm.Ring,StringComparison.OrdinalIgnoreCase));if(bb!=null)PushBird(bb,ai.Recent(bb.Ring,300).Select(q=>(lat:q.Latitude,lon:q.Longitude)));}
   };
   var key=GetYandexMapsKey();
   var webDir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BirdTrack","web");
   Directory.CreateDirectory(webDir);
   var html=string.IsNullOrWhiteSpace(key)
    ? NoKeyHtml.Replace("KEYPATH",YandexKeyPath())
    : RealMapHtml.Replace("YOUR_YANDEX_MAPS_API_KEY",Uri.EscapeDataString(key));
   File.WriteAllText(Path.Combine(webDir,"map.html"),html,new UTF8Encoding(false));
   browserMap.CoreWebView2.SetVirtualHostNameToFolderMapping("birdtrack.local",webDir,Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
   browserMap.CoreWebView2.Navigate("http://birdtrack.local/map.html");
  }catch(Exception ex){
   gpsStatus.Text="Карта недоступна: проверь WebView2 Runtime/интернет";gpsStatus.ForeColor=Color.Orange;
  }
 }
 string YandexKeyPath()=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BirdTrack","yandex-map-key.txt");
 string GetYandexMapsKey(){
  try {
   var keyPath=YandexKeyPath();
   if(File.Exists(keyPath)) return File.ReadAllText(keyPath).Trim();
  }catch{}
  return "";
 }
 void UpdateRealMap(double lat,double lon,double accuracy){
  pendingLat=lat;pendingLon=lon;pendingAccuracy=accuracy;
  if(!realMapReady||browserMap.CoreWebView2==null)return;
  _=browserMap.CoreWebView2.ExecuteScriptAsync($"window.setGps && window.setGps({lat.ToString(System.Globalization.CultureInfo.InvariantCulture)},{lon.ToString(System.Globalization.CultureInfo.InvariantCulture)},{accuracy.ToString(System.Globalization.CultureInfo.InvariantCulture)});");
 }
 sealed class IncomingGps { public double latitude {get;set;} public double longitude {get;set;} public double accuracy {get;set;} public string? timestamp {get;set;} public string? place {get;set;} public string? ring {get;set;} }
 string AppDataDir()=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BirdTrack");
 string GetGpsToken(){
  try{
   var p=Path.Combine(AppDataDir(),"gps-token.txt");
   if(File.Exists(p)){var t=File.ReadAllText(p).Trim();if(t.Length>0)return t;}
   Directory.CreateDirectory(AppDataDir());
   var token=Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
   File.WriteAllText(p,token);
   return token;
  }catch{return "";}
 }
 List<string> LanAddresses(){
  var res=new List<string>();
  try{
   foreach(var n in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()){
    if(n.OperationalStatus!=System.Net.NetworkInformation.OperationalStatus.Up||n.NetworkInterfaceType==System.Net.NetworkInformation.NetworkInterfaceType.Loopback)continue;
    foreach(var a in n.GetIPProperties().UnicastAddresses)
     if(a.Address.AddressFamily==System.Net.Sockets.AddressFamily.InterNetwork&&!a.Address.ToString().StartsWith("169.254."))res.Add(a.Address.ToString());
   }
  }catch{}
  return res;
 }
 string GpsHelpText(){
  var token=GetGpsToken();
  var ips=LanAddresses().Take(3).ToList();
  var urls=ips.Count>0?string.Join("\n",ips.Select(ip=>"http://"+ip+":8766/gps/?token="+token)):"(нет сети — подключите Wi‑Fi или USB-модем iPhone)";
  return "Ключ Яндекс Карт: %LOCALAPPDATA%\\BirdTrack\\yandex-map-key.txt\nАдрес для iPhone (POST, JSON: latitude, longitude, accuracy, timestamp, place, ring):\n"+urls;
 }
 System.Net.Sockets.TcpListener? gpsTcp;
 void StartGpsListener(){
  try{
   gpsCts=new CancellationTokenSource();var ct=gpsCts.Token;
   gpsTcp=new System.Net.Sockets.TcpListener(IPAddress.Any,8766);gpsTcp.Start();
   gpsStatus.Text="Приёмник запущен • ожидает координаты";gpsStatus.ForeColor=Color.LightGreen;
   _=Task.Run(async()=>{while(!ct.IsCancellationRequested){System.Net.Sockets.TcpClient client;try{client=await gpsTcp.AcceptTcpClientAsync();}catch{break;}_=Task.Run(()=>HandleGpsClient(client));}});
  }catch(Exception ex){gpsStatus.Text="Не удалось запустить GPS-приёмник: "+ex.Message;gpsStatus.ForeColor=Color.OrangeRed;}
 }
 static int FindHeaderEnd(List<byte> b){for(int i=0;i+3<b.Count;i++)if(b[i]==13&&b[i+1]==10&&b[i+2]==13&&b[i+3]==10)return i;return -1;}
 static async Task HttpReply(System.Net.Sockets.NetworkStream s,int code,string json){
  var status=code==200?"OK":"Error";
  var body=Encoding.UTF8.GetBytes(json);
  var head=Encoding.ASCII.GetBytes("HTTP/1.1 "+code+" "+status+"\r\nContent-Type: application/json\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\n\r\n");
  await s.WriteAsync(head,0,head.Length);await s.WriteAsync(body,0,body.Length);
 }
 async Task HandleGpsClient(System.Net.Sockets.TcpClient client){
  using(client){
   try{
    var stream=client.GetStream();
    var buf=new List<byte>();var tmp=new byte[4096];int headerEnd=-1;
    using var cts=new CancellationTokenSource(5000);
    while(headerEnd<0&&buf.Count<65536){
     int n=await stream.ReadAsync(tmp,0,tmp.Length,cts.Token);if(n<=0)break;
     buf.AddRange(tmp.Take(n));headerEnd=FindHeaderEnd(buf);
    }
    if(headerEnd<0){await HttpReply(stream,400,"{\"ok\":false}");return;}
    var head=Encoding.ASCII.GetString(buf.GetRange(0,headerEnd).ToArray());
    var lines=head.Split("\r\n");var req=lines[0].Split(' ');
    if(req.Length<2||!req[0].Equals("POST",StringComparison.OrdinalIgnoreCase)){await HttpReply(stream,405,"{\"ok\":false}");return;}
    int len=0;
    foreach(var l in lines.Skip(1)){var i=l.IndexOf(':');if(i>0&&l.Substring(0,i).Trim().Equals("Content-Length",StringComparison.OrdinalIgnoreCase))int.TryParse(l.Substring(i+1).Trim(),out len);}
    if(len<=0||len>65536){await HttpReply(stream,400,"{\"ok\":false}");return;}
    bool local=client.Client.RemoteEndPoint is IPEndPoint ep&&IPAddress.IsLoopback(ep.Address);
    if(!local){
     var qi=req[1].IndexOf('?');var query=qi>=0?req[1].Substring(qi+1):"";
     if(!("&"+query+"&").Contains("&token="+GetGpsToken()+"&")){await HttpReply(stream,403,"{\"ok\":false,\"error\":\"bad token\"}");return;}
    }
    int bodyStart=headerEnd+4;
    while(buf.Count-bodyStart<len){int n=await stream.ReadAsync(tmp,0,tmp.Length,cts.Token);if(n<=0)break;buf.AddRange(tmp.Take(n));}
    var json=Encoding.UTF8.GetString(buf.GetRange(bodyStart,Math.Min(len,buf.Count-bodyStart)).ToArray());
    var gps=JsonSerializer.Deserialize<IncomingGps>(json,new JsonSerializerOptions{PropertyNameCaseInsensitive=true,NumberHandling=System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString});
    if(gps!=null&&gps.latitude>=-90&&gps.latitude<=90&&gps.longitude>=-180&&gps.longitude<=180){
     DateTime seen=DateTime.Now;if(!string.IsNullOrWhiteSpace(gps.timestamp)&&DateTime.TryParse(gps.timestamp,out var parsed))seen=parsed;
     BeginInvoke(new Action(()=>ApplyIncomingGps(gps,seen)));
     await HttpReply(stream,200,"{\"ok\":true}");
    }else await HttpReply(stream,400,"{\"ok\":false}");
   }catch{try{await HttpReply(client.GetStream(),400,"{\"ok\":false}");}catch{}}
  }
 }
 void ApplyIncomingGps(IncomingGps gps, DateTime seen)
 {
  gpsCoords.Text=$"Широта: {gps.latitude:F6}°     Долгота: {gps.longitude:F6}°";
  gpsAccuracy.Text=$"Точность: {(gps.accuracy>0?gps.accuracy.ToString("0.#")+" м":"не указана")}";
  gpsTime.Text="Последнее обновление: "+seen.ToString("dd.MM.yyyy HH:mm:ss")+(string.IsNullOrWhiteSpace(gps.place)?"":" • "+gps.place);
  gpsStatus.Text="Получены координаты";gpsStatus.ForeColor=Color.LightGreen;
  map.PersonalLat=gps.latitude;map.PersonalLon=gps.longitude;map.Invalidate();UpdateRealMap(gps.latitude,gps.longitude,gps.accuracy);
  var ring = gps.ring?.Trim();
  if(string.IsNullOrWhiteSpace(ring))
   ring = table.CurrentRow?.DataBoundItem is Bird selected ? selected.Ring : null;
  if(!string.IsNullOrWhiteSpace(ring))
  {
   var bird=data.FirstOrDefault(b=>b.Ring.Equals(ring,StringComparison.OrdinalIgnoreCase));
   if(bird!=null){bird.Lat=gps.latitude;bird.Lon=gps.longitude;bird.Seen=seen;if(!string.IsNullOrWhiteSpace(gps.place))bird.Place=gps.place;Save();RefreshTable();}
   FeedAi(ring,gps.latitude,gps.longitude,gps.accuracy,seen);
   SaveAiHistory();
  }
  else {aiStatus.Text="AI: GPS получен; выберите кольцо для привязки";aiStatus.ForeColor=Color.Goldenrod;}
 }
 void SaveAiHistory(){try{Directory.CreateDirectory(Path.GetDirectoryName(historyFile)!);ai.Save(historyFile);File.WriteAllText(findingsFile,JsonSerializer.Serialize(aiFindings,new JsonSerializerOptions{WriteIndented=true}));}catch{}}
 void LoadAiFindings(){try{if(File.Exists(findingsFile)){var saved=JsonSerializer.Deserialize<List<AiFinding>>(File.ReadAllText(findingsFile));if(saved!=null)aiFindings.AddRange(saved.Take(300));}}catch{}}
 void ShowAiReport()
 {
  var stale=data.Where(b=>b.Status=="Активно"&&DateTime.Now-b.Seen>TimeSpan.FromMinutes(30))
   .Select(b=>new AiFinding{Ring=b.Ring,Time=DateTime.Now,Severity="Внимание",Reason=$"Нет GPS-сигнала более {(int)(DateTime.Now-b.Seen).TotalMinutes} мин.",Latitude=b.Lat,Longitude=b.Lon}).ToList();
  var all=stale.Concat(aiFindings).OrderByDescending(x=>x.Time).ToList();
  using var f=new AiReportForm(all,ai.PointCount,ai.RingCount);
  f.ShowDialog(this);
 }
 // ===== Симулятор GPS-трекера: птица летит, координаты идут в карту и в AI =====
 static HttpClient MakeHttp(){var c=new HttpClient{Timeout=TimeSpan.FromSeconds(10)};c.DefaultRequestHeaders.UserAgent.ParseAdd("BirdTrackPro/1.0 (bird tracking desktop app)");return c;}
 static string Fx(double v)=>v.ToString("R",System.Globalization.CultureInfo.InvariantCulture);
 void Js(string script){if(realMapReady&&browserMap.CoreWebView2!=null)_=browserMap.CoreWebView2.ExecuteScriptAsync(script);}
 string BirdLabel(Bird b)=>"№"+b.Ring+" "+b.Species;
 void PushBird(Bird b,IEnumerable<(double lat,double lon)>? trail=null){
  var t=trail==null?"null":"["+string.Join(",",trail.Select(q=>"["+Fx(q.lat)+","+Fx(q.lon)+"]"))+"]";
  Js("window.setBird&&window.setBird("+JsonSerializer.Serialize(b.Ring)+","+JsonSerializer.Serialize(BirdLabel(b))+","+Fx(b.Lat)+","+Fx(b.Lon)+","+t+");");
 }
 void FocusBird(string ring,int? zoom=null)=>Js("window.focusBird&&window.focusBird("+JsonSerializer.Serialize(ring)+","+(zoom.HasValue?zoom.Value.ToString():"null")+");");
 void InitSim(){
  simTimer.Tick+=(_,_)=>SimTick();
  FormClosing+=(_,_)=>{try{Save();SaveAiHistory();}catch{}};
  table.CellClick+=(_,e)=>{if(e.RowIndex>=0&&table.Rows[e.RowIndex].DataBoundItem is Bird bb)FocusBird(bb.Ring);};
  foreach(var b in data.Where(x=>x.Tracking&&x.Status=="Активно"&&x.Device=="GPS-трекер").ToList())StartTracker(b,false);
 }
 async Task<(double lat,double lon,string name)?> GeocodeAsync(string query){
  var m=System.Text.RegularExpressions.Regex.Match(query,@"^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$");
  if(m.Success){
   var cLat=double.Parse(m.Groups[1].Value,System.Globalization.CultureInfo.InvariantCulture);
   var cLon=double.Parse(m.Groups[2].Value,System.Globalization.CultureInfo.InvariantCulture);
   if(Math.Abs(cLat)<=90&&Math.Abs(cLon)<=180)return (cLat,cLon,"координаты");
  }
  try{
   var url="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q="+Uri.EscapeDataString(query);
   using var doc=JsonDocument.Parse(await http.GetStringAsync(url));
   var arr=doc.RootElement;if(arr.ValueKind!=JsonValueKind.Array||arr.GetArrayLength()==0)return null;
   var e=arr[0];
   var gLat=double.Parse(e.GetProperty("lat").GetString()!,System.Globalization.CultureInfo.InvariantCulture);
   var gLon=double.Parse(e.GetProperty("lon").GetString()!,System.Globalization.CultureInfo.InvariantCulture);
   var name=e.TryGetProperty("display_name",out var dn)?(dn.GetString()??query):query;
   return (gLat,gLon,name);
  }catch{return null;}
 }
 async Task<bool> RelocateAsync(Bird b){
  if(string.IsNullOrWhiteSpace(b.Place))return false;
  gpsStatus.Text="Ищу адрес «"+b.Place+"»…";gpsStatus.ForeColor=Color.Orange;
  var g=await GeocodeAsync(b.Place);
  if(g==null){
   gpsStatus.Text="Адрес не найден: "+b.Place;gpsStatus.ForeColor=Color.OrangeRed;
   MessageBox.Show("Не удалось найти адрес «"+b.Place+"».\nПроверьте интернет или напишите город/адрес точнее (можно координаты: 55.75, 37.62).\nТрекер не запущен.");
   return false;
  }
  b.Lat=g.Value.lat;b.Lon=g.Value.lon;
  StartTracker(b,true);
  gpsStatus.Text="Трекер "+b.Ring+" запущен (симуляция) • "+g.Value.name;gpsStatus.ForeColor=Color.LightGreen;
  return true;
 }
 void StartTracker(Bird b,bool fresh){
  if(fresh){ai.ResetRing(b.Ring);Js("window.removeBird&&window.removeBird("+JsonSerializer.Serialize(b.Ring)+");");}
  var last=fresh?null:ai.Last(b.Ring);
  DateTime start;
  if(last!=null){b.Lat=last.Latitude;b.Lon=last.Longitude;start=last.Time;}
  else start=DateTime.UtcNow.Date.AddHours(6-b.Lon/15.0).ToLocalTime();
  sims[b.Ring]=new BirdSim(b.Ring,b.Species,b.Lat,b.Lon,b.Heading,start,b.Battery);
  b.Tracking=true;
  var trail=fresh?null:ai.Recent(b.Ring,300).Select(q=>(lat:q.Latitude,lon:q.Longitude));
  PushBird(b,trail);
  if(fresh)FocusBird(b.Ring,8);
  if(!simTimer.Enabled)simTimer.Start();
  Save();
 }
 void StopTracker(Bird b){
  sims.Remove(b.Ring);b.Tracking=false;Save();SaveAiHistory();
  gpsStatus.Text="Трекер "+b.Ring+" остановлен";gpsStatus.ForeColor=Color.Orange;
 }
 async void ToggleTracker(){
  try{
   var b=Sel();if(b==null)return;
   if(sims.ContainsKey(b.Ring)){StopTracker(b);return;}
   if(b.Device!="GPS-трекер"){MessageBox.Show("Трекер можно запустить только для устройства «GPS-трекер».");return;}
   if(b.Status!="Активно"){MessageBox.Show("Сначала поставьте статус «Активно» (кнопка «Редактировать»).");return;}
   if(ai.Last(b.Ring)!=null){StartTracker(b,false);FocusBird(b.Ring,8);gpsStatus.Text="Трекер "+b.Ring+" продолжает путь (симуляция)";gpsStatus.ForeColor=Color.LightGreen;return;}
   if(string.IsNullOrWhiteSpace(b.Place)){MessageBox.Show("Укажите «Последнее место» (город/адрес или координаты) через «Редактировать» — оттуда трекер начнёт движение.");return;}
   await RelocateAsync(b);
  }catch(Exception ex){MessageBox.Show(ex.Message);}
 }
 void SimTick(){
  tickNo++;
  foreach(var sm in sims.Values.ToList()){
   var b=data.FirstOrDefault(x=>x.Ring.Equals(sm.Ring,StringComparison.OrdinalIgnoreCase));
   if(b==null||b.Status!="Активно"||b.Device!="GPS-трекер"){sims.Remove(sm.Ring);if(b!=null)b.Tracking=false;continue;}
   sm.Step(SimMinutesPerTick);
   b.Lat=sm.Lat;b.Lon=sm.Lon;b.Heading=sm.Heading;b.Seen=DateTime.Now;b.Battery=(int)Math.Round(sm.Battery);
   PushBird(b);
   FeedAi(b.Ring,sm.Lat,sm.Lon,sm.Accuracy,sm.Time);
  }
  if(sims.Count==0){simTimer.Stop();Save();SaveAiHistory();}
  else{if(tickNo%10==0)Save();if(tickNo%15==0)SaveAiHistory();}
  table.Invalidate();
 }
 void FeedAi(string ring,double lat,double lon,double accuracy,DateTime time){
  var finding=ai.Add(ring,lat,lon,accuracy,time);
  if(finding!=null){aiFindings.Insert(0,finding);if(aiFindings.Count>300)aiFindings.RemoveAt(aiFindings.Count-1);}
  aiStatus.Text=finding==null?"AI: №"+ring+" — координата принята, аномалий нет":"AI: обнаружена аномалия • "+finding.Severity+" • №"+ring;
  aiStatus.ForeColor=finding==null?Color.MediumPurple:Color.Orange;
 }
 Control Card(string title,Label value,Color color){var p=new Panel{Dock=DockStyle.Fill,BackColor=panel,Margin=new Padding(0,0,9,0)};p.Controls.Add(new Label{Text=title,AutoSize=true,ForeColor=Color.LightSteelBlue,Font=new Font("Segoe UI",8,FontStyle.Bold),Location=new Point(14,10)});value.Text="—";value.Font=new Font("Segoe UI",23,FontStyle.Bold);value.ForeColor=color;value.Location=new Point(14,31);value.AutoSize=true;p.Controls.Add(value);return p;}
 Button Btn(string t,Color c,EventHandler h,int w=105){var b=new Button{Text=t,Width=w,Height=32,Margin=new Padding(0,0,6,0),BackColor=c,ForeColor=Color.White,FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",8,FontStyle.Bold)};b.FlatAppearance.BorderSize=0;b.Click+=h;return b;}
 void Col(string prop,string title,int weight,string? fmt=null){var c=new DataGridViewTextBoxColumn{DataPropertyName=prop,Name=prop,HeaderText=title,FillWeight=weight,MinimumWidth=50};if(fmt!=null)c.DefaultCellStyle.Format=fmt;table.Columns.Add(c);}
 Bird? Sel(){if(table.CurrentRow?.DataBoundItem is Bird b)return b;MessageBox.Show("Сначала выбери птицу в таблице.");return null;}
 async void Add(){
  try{
   using var f=new BirdForm();if(f.ShowDialog(this)!=DialogResult.OK||f.Value==null)return;
   var nb=f.Value;
   if(data.Any(x=>x.Ring==nb.Ring)){MessageBox.Show("Номер кольца уже есть.");return;}
   nb.Lat=52.50+data.Count*.025;nb.Lon=13.37+data.Count*.02;
   data.Add(nb);Save();RefreshTable();
   if(nb.Device=="GPS-трекер"&&nb.Status=="Активно"&&!string.IsNullOrWhiteSpace(nb.Place))await RelocateAsync(nb);
  }catch(Exception ex){MessageBox.Show(ex.Message);}
 }
 async void Edit(){
  try{
   var b=Sel();if(b==null)return;using var f=new BirdForm(b);if(f.ShowDialog(this)!=DialogResult.OK||f.Value==null)return;
   var oldRing=b.Ring;var oldPlace=b.Place??"";
   if(!oldRing.Equals(f.Value.Ring,StringComparison.OrdinalIgnoreCase)&&sims.Remove(oldRing)){b.Tracking=false;Js("window.removeBird&&window.removeBird("+JsonSerializer.Serialize(oldRing)+");");}
   b.Ring=f.Value.Ring;b.Species=f.Value.Species;b.Device=f.Value.Device;b.Status=f.Value.Status;b.Place=f.Value.Place;b.Seen=f.Value.Seen;b.Battery=f.Value.Battery;Save();RefreshTable();
   bool placeChanged=!string.Equals(oldPlace.Trim(),(b.Place??"").Trim(),StringComparison.OrdinalIgnoreCase);
   if(placeChanged&&!string.IsNullOrWhiteSpace(b.Place)&&b.Device=="GPS-трекер"&&b.Status=="Активно")await RelocateAsync(b);
  }catch(Exception ex){MessageBox.Show(ex.Message);}
 }
 void Delete(){var b=Sel();if(b==null)return;if(MessageBox.Show("Удалить кольцо "+b.Ring+"?","Подтверждение",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;sims.Remove(b.Ring);Js("window.removeBird&&window.removeBird("+JsonSerializer.Serialize(b.Ring)+");");data.Remove(b);Save();RefreshTable();}
 void UpdateGps(){var b=Sel();if(b==null)return;using var f=new GpsForm(b);if(f.ShowDialog(this)!=DialogResult.OK)return;b.Place=f.Place;b.Lat=f.Lat;b.Lon=f.Lon;b.Seen=f.Seen;b.Status=f.Status;b.Battery=f.Battery;Save();RefreshTable();map.Invalidate();}
 void RefreshTable(){var q=search.Text.Trim();table.DataSource=new BindingList<Bird>(data.Where(b=>string.IsNullOrWhiteSpace(q)||b.Ring.Contains(q,StringComparison.OrdinalIgnoreCase)||b.Species.Contains(q,StringComparison.OrdinalIgnoreCase)||b.Status.Contains(q,StringComparison.OrdinalIgnoreCase)||b.Place.Contains(q,StringComparison.OrdinalIgnoreCase)).ToList());total.Text=data.Count.ToString();active.Text=data.Count(b=>b.Status=="Активно").ToString();alerts.Text=data.Count(b=>b.Status!="Активно").ToString();map.Items=data;map.Invalidate();}
 void LoadData(){try{Directory.CreateDirectory(Path.GetDirectoryName(file)!);if(File.Exists(file)){var l=JsonSerializer.Deserialize<List<Bird>>(File.ReadAllText(file));if(l!=null&&l.Count>0){foreach(var b in l)data.Add(b);return;}}data.Add(new Bird{Ring="1298",Species="Белый аист",Status="Активно",Place="Берлин · сектор A",Battery=82,Lat=52.52,Lon=13.405,Seen=DateTime.Now.AddMinutes(-15)});data.Add(new Bird{Ring="2041",Species="Ласточка",Status="Активно",Place="Берлин · парк",Battery=67,Lat=52.545,Lon=13.43,Seen=DateTime.Now.AddHours(-2)});data.Add(new Bird{Ring="3177",Species="Серый журавль",Status="Требует обслуживания",Place="Озёрная зона",Battery=18,Lat=52.49,Lon=13.38,Seen=DateTime.Now.AddHours(-7)});data.Add(new Bird{Ring="4012",Species="Сапсан",Status="Неактивно",Place="Нет свежего сигнала",Battery=0,Lat=52.57,Lon=13.36,Seen=DateTime.Now.AddDays(-1)});Save();}catch(Exception e){MessageBox.Show(e.Message);}}
 void Save(){try{Directory.CreateDirectory(Path.GetDirectoryName(file)!);File.WriteAllText(file,JsonSerializer.Serialize(data.ToList(),new JsonSerializerOptions{WriteIndented=true}));}catch(Exception e){MessageBox.Show(e.Message);}}
 void Export(){using var d=new SaveFileDialog{Filter="CSV (*.csv)|*.csv",FileName="BirdTrack.csv"};if(d.ShowDialog()!=DialogResult.OK)return;var lines=new List<string>{"Кольцо;Вид;Тип;Статус;Место;Время;Батарея;Широта;Долгота"};lines.AddRange(data.Select(b=>$"{b.Ring};{b.Species};{b.Device};{b.Status};{b.Place};{b.Seen:dd.MM.yyyy HH:mm};{b.Battery};{b.Lat};{b.Lon}"));File.WriteAllText(d.FileName,"\uFEFF"+string.Join(Environment.NewLine,lines));MessageBox.Show("Экспорт завершён.");}
}
sealed class BirdSim{
 public string Ring; public double Lat,Lon,Heading,Battery,Accuracy=8; public DateTime Time;
 readonly double baseSpeed; readonly double? pref; readonly Random rng=new(); int rest;
 public BirdSim(string ring,string species,double lat,double lon,double? heading,DateTime time,double battery){
  Ring=ring;Lat=lat;Lon=lon;Time=time;Battery=Math.Clamp(battery,1,100);
  var sp=species.ToLowerInvariant();
  baseSpeed=sp.Contains("журавл")?55:sp.Contains("аист")?45:sp.Contains("ласточ")?38:sp.Contains("сапсан")?70:sp.Contains("гус")?60:sp.Contains("утк")?65:sp.Contains("лебед")?55:(sp.Contains("орел")||sp.Contains("орёл"))?40:45;
  var m=DateTime.Now.Month;
  pref=(m>=8&&m<=11)?200:(m>=2&&m<=5)?20:(double?)null;
  Heading=heading??(((pref??rng.Next(0,360))+rng.Next(-20,21)+360)%360);
 }
 double Gauss(){var u1=1-rng.NextDouble();var u2=rng.NextDouble();return Math.Sqrt(-2*Math.Log(u1))*Math.Cos(2*Math.PI*u2);}
 public void Step(double minutes){
  Time=Time.AddMinutes(minutes);
  var utc=Time.ToUniversalTime();
  var solar=(utc.Hour+utc.Minute/60.0+Lon/15.0+48)%24;
  bool day=solar>=5&&solar<19;
  double speed;
  if(rest>0){rest--;speed=rng.NextDouble()*1.5;}
  else if(!day){speed=rng.NextDouble()*1.0;}
  else{if(rng.NextDouble()<0.015)rest=rng.Next(6,20);speed=baseSpeed*(0.85+0.3*rng.NextDouble());}
  bool settled=pref.HasValue&&((pref.Value>90&&pref.Value<270&&Lat<12)||(pref.Value<=90&&Lat>68));
  if(settled)speed*=0.05;
  if(speed>5){
   if(pref.HasValue){var d=((pref.Value-Heading+540)%360)-180;Heading+=d*0.05;}
   Heading=(Heading+Gauss()*5+360)%360;
  }
  var km=speed*minutes/60.0;var rad=Heading*Math.PI/180;
  Lat+=km*Math.Cos(rad)/111.32;
  Lon+=km*Math.Sin(rad)/(111.32*Math.Max(0.05,Math.Cos(Lat*Math.PI/180)));
  Lat=Math.Clamp(Lat,-85,85);if(Lon>180)Lon-=360;if(Lon<-180)Lon+=360;
  Accuracy=4+rng.NextDouble()*10;
  Battery=Math.Max(1,Battery-0.02);
 }
}
sealed class MapPanel:Panel{
 public IEnumerable<Bird> Items=Array.Empty<Bird>();public string Selected="";public bool ShowPersonalLocation;public double? PersonalLat,PersonalLon;public MapPanel(){DoubleBuffered=true;BackColor=Color.FromArgb(6,21,41);}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;for(int x=0;x<Width;x+=28)g.DrawLine(new Pen(Color.FromArgb(23,62,83)),x,0,x,Height);for(int y=0;y<Height;y+=28)g.DrawLine(new Pen(Color.FromArgb(23,62,83)),0,y,Width,y);
 var pts=Items.Select(b=>(b, x:(float)Math.Clamp(Width*(.15+(b.Lon-13.30)/.22),18,Width-18), y:(float)Math.Clamp(Height*(.18+(b.Lat-52.43)/.22),18,Height-18))).ToList();
 using(var land=new SolidBrush(Color.FromArgb(17,47,65)))g.FillPolygon(land,new[]{new Point(0,Height/5),new Point(Width/5,Height/10),new Point(Width/3,Height/4),new Point(Width/2,Height/7),new Point(Width*4/5,Height/4),new Point(Width,Height/3),new Point(Width,Height*3/4),new Point(Width*3/4,Height*4/5),new Point(Width/2,Height*2/3),new Point(Width/4,Height*4/5),new Point(0,Height*3/4)});
 for(int i=1;i<pts.Count;i++)using(var p=new Pen(Color.FromArgb(100,63,221,222),2)){p.DashPattern=new float[]{4,4};g.DrawLine(p,pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y);}
 foreach(var p in pts){var b=p.b;Color c=b.Status=="Активно"?Color.FromArgb(63,235,204):b.Status=="Требует обслуживания"?Color.Orange:Color.LightCoral;if(b.Ring==Selected)using(var halo=new Pen(Color.FromArgb(120,c),8))g.DrawEllipse(halo,p.x-9,p.y-9,18,18);using(var br=new SolidBrush(c))g.FillEllipse(br,p.x-5,p.y-5,10,10);g.DrawString("№"+b.Ring,new Font("Segoe UI",8,b.Ring==Selected?FontStyle.Bold:FontStyle.Regular),Brushes.White,p.x+8,p.y-8);}
 if(ShowPersonalLocation){float ux=Width*.50f,uy=Height*.48f;using(var halo=new Pen(Color.FromArgb(130,255,190,70),10))g.DrawEllipse(halo,ux-10,uy-10,20,20);using(var br=new SolidBrush(Color.Gold))g.FillEllipse(br,ux-5,uy-5,10,10);g.DrawString("МОЁ МЕСТОПОЛОЖЕНИЕ",new Font("Segoe UI",8,FontStyle.Bold),Brushes.Gold,ux+9,uy-8);}
 g.DrawString("● Птицы   ● Моё местоположение",new Font("Segoe UI",8),new SolidBrush(Color.LightSteelBlue),8,Height-22);g.DrawString("СХЕМА, НЕ ГЕОГРАФИЧЕСКАЯ КАРТА",new Font("Segoe UI",7,FontStyle.Bold),new SolidBrush(Color.LightSteelBlue),8,8);}
}
sealed class BirdForm:Form{
 TextBox ring=new(),species=new(),place=new();ComboBox device=new(),status=new();NumericUpDown battery=new();public Bird? Value;
 public BirdForm(Bird? b=null){Text=b==null?"Добавить птицу":"Редактировать птицу";StartPosition=FormStartPosition.CenterParent;FormBorderStyle=FormBorderStyle.FixedDialog;ClientSize=new Size(450,330);BackColor=Color.FromArgb(17,35,62);ForeColor=Color.White;
 device.Items.AddRange(new object[]{"GPS-трекер","Обычное кольцо","Радиометка VHF"});device.DropDownStyle=ComboBoxStyle.DropDownList;status.Items.AddRange(new object[]{"Активно","Неактивно","Требует обслуживания"});status.DropDownStyle=ComboBoxStyle.DropDownList;battery.Maximum=100;
 Add("Номер кольца",ring,15);Add("Вид птицы",species,55);Add("Тип устройства",device,95);Add("Статус",status,135);Add("Последнее место",place,175);Add("Батарея %",battery,215);
 var save=new Button{Text="Сохранить",Location=new Point(190,270),DialogResult=DialogResult.None};save.Click+=(_,_)=>{if(ring.Text.Trim()==""||species.Text.Trim()==""){MessageBox.Show("Заполни номер и вид птицы.");return;}Value=new Bird{Ring=ring.Text.Trim(),Species=species.Text.Trim(),Device=Convert.ToString(device.SelectedItem)??"GPS-трекер",Status=Convert.ToString(status.SelectedItem)??"Активно",Place=place.Text,Battery=(int)battery.Value,Seen=DateTime.Now};DialogResult=DialogResult.OK;Close();};Controls.Add(save);
 device.SelectedIndex=0;status.SelectedIndex=0;battery.Value=100;if(b!=null){ring.Text=b.Ring;species.Text=b.Species;device.SelectedItem=b.Device;status.SelectedItem=b.Status;place.Text=b.Place;battery.Value=Math.Clamp(b.Battery,0,100);}
 }
 void Add(string t,Control c,int y){Controls.Add(new Label{Text=t,Location=new Point(18,y+5),AutoSize=true,ForeColor=Color.LightBlue});c.SetBounds(170,y,250,28);c.BackColor=Color.FromArgb(7,18,38);c.ForeColor=Color.White;Controls.Add(c);}
}
sealed class GpsForm:Form{
 TextBox place=new(),lat=new(),lon=new();DateTimePicker date=new();ComboBox status=new();NumericUpDown battery=new();
 public string Place=>place.Text;public double Lat=>double.TryParse(lat.Text.Replace(',','.'),System.Globalization.NumberStyles.Any,System.Globalization.CultureInfo.InvariantCulture,out var x)?x:0;public double Lon=>double.TryParse(lon.Text.Replace(',','.'),System.Globalization.NumberStyles.Any,System.Globalization.CultureInfo.InvariantCulture,out var x)?x:0;public DateTime Seen=>date.Value;public string Status=>Convert.ToString(status.SelectedItem)??"Активно";public int Battery=>(int)battery.Value;
 public GpsForm(Bird b){Text="Обновить GPS — кольцо "+b.Ring;StartPosition=FormStartPosition.CenterParent;FormBorderStyle=FormBorderStyle.FixedDialog;ClientSize=new Size(470,330);BackColor=Color.FromArgb(17,35,62);ForeColor=Color.White;date.Format=DateTimePickerFormat.Custom;date.CustomFormat="dd.MM.yyyy HH:mm";status.Items.AddRange(new object[]{"Активно","Неактивно","Требует обслуживания"});status.DropDownStyle=ComboBoxStyle.DropDownList;
 Add("Место",place,15);Add("Широта",lat,55);Add("Долгота",lon,95);Add("Время",date,135);Add("Статус",status,175);Add("Батарея %",battery,215);
 place.Text=b.Place;lat.Text=b.Lat.ToString(System.Globalization.CultureInfo.InvariantCulture);lon.Text=b.Lon.ToString(System.Globalization.CultureInfo.InvariantCulture);date.Value=DateTime.Now;status.SelectedItem=b.Status;if(status.SelectedIndex<0)status.SelectedIndex=0;battery.Maximum=100;battery.Value=Math.Clamp(b.Battery,0,100);
 var save=new Button{Text="Сохранить GPS",Location=new Point(180,270),Size=new Size(130,32)};save.Click+=(_,_)=>{DialogResult=DialogResult.OK;Close();};Controls.Add(save);}
 void Add(string t,Control c,int y){Controls.Add(new Label{Text=t,Location=new Point(18,y+5),AutoSize=true,ForeColor=Color.LightBlue});c.SetBounds(170,y,270,28);c.BackColor=Color.FromArgb(7,18,38);c.ForeColor=Color.White;Controls.Add(c);}
}