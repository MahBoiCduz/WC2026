// BẬT CHẾ ĐỘ NGHIÊM NGẶT
'use strict';

// ----------------------------------------------------
// 1. QUẢN LÝ TRẠNG THÁI (STATE ENGINE & LOCAL STORAGE)
// ----------------------------------------------------
let state = {};

function initLocalStorageState() {
  const savedState = localStorage.getItem('worldcup_betting_state');
  if (savedState) {
    try {
      state = JSON.parse(savedState);
      // Đảm bảo các cấu hình mới nếu có
      if (!state.config) state.config = INITIAL_DATA.config;
      if (!state.config.systemWalletBalance) state.config.systemWalletBalance = 0;
      if (!state.simulatedClock) {
        state.simulatedClock = new Date().toISOString();
      }
    } catch (e) {
      console.error("Lỗi parse LocalStorage, dùng dữ liệu mẫu", e);
      resetToDefault();
    }
  } else {
    resetToDefault();
  }
}

function saveState() {
  localStorage.setItem('worldcup_betting_state', JSON.stringify(state));
}

function resetToDefault() {
  state = JSON.parse(JSON.stringify(INITIAL_DATA)); // Clone sâu
  state.simulatedClock = new Date().toISOString();
  saveState();
  showToast("🔄 Đã khôi phục dữ liệu ban đầu thành công!", "info");
}

// ----------------------------------------------------
// 2. HELPER FUNCTIONS
// ----------------------------------------------------
function getSimulatedTime() {
  return new Date(state.simulatedClock);
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function getUpperLowerTeams(match) {
  const isHomeUpper = match.handicap.upperTeamId === 'home';
  return {
    upperTeamName: isHomeUpper ? match.homeTeam : match.awayTeam,
    lowerTeamName: isHomeUpper ? match.awayTeam : match.homeTeam,
    upperFlag: isHomeUpper ? getFlagEmoji(match.homeTeam) : getFlagEmoji(match.awayTeam),
    lowerFlag: isHomeUpper ? getFlagEmoji(match.awayTeam) : getFlagEmoji(match.homeTeam),
    upperTeamKey: isHomeUpper ? 'home' : 'away',
    lowerTeamKey: isHomeUpper ? 'away' : 'home'
  };
}

// Hàm sinh cờ quốc gia giả lập dựa trên tên
function getFlagEmoji(country) {
  const flags = {
    "Qatar": "🇶🇦", "Ecuador": "🇪🇨", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Iran": "🇮🇷",
    "Senegal": "🇸🇳", "Netherlands": "🇳🇱", "USA": "🇺🇸", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    "Argentina": "🇦🇷", "Saudi Arabia": "🇸🇦", "France": "🇫🇷", "Australia": "🇦🇺",
    "Brazil": "🇧🇷", "Vietnam": "🇻🇳", "Japan": "🇯🇵", "Germany": "🇩🇪",
    "Spain": "🇪🇸", "Portugal": "🇵🇹", "Italy": "🇮🇹"
  };
  return flags[country] || "🏳️";
}

// ----------------------------------------------------
// 3. ENGINE TÍNH CƯỢC & THANH TOÁN (SETTLEMENT ENGINE)
// ----------------------------------------------------
function settleMatchBets(match) {
  const activeBets = state.bets.filter(b => b.matchId === match.id && b.status === 'active');
  if (activeBets.length === 0) return;

  const { upperTeamKey } = getUpperLowerTeams(match);
  const H = parseFloat(match.handicap.value);
  const platformFeePercent = parseFloat(state.config.platformFee);

  // Điểm số đội nhà (A) và đội khách (B)
  const scoreHome = parseInt(match.homeScore);
  const scoreAway = parseInt(match.awayScore);

  // Đổi số điểm sang Điểm Cửa Trên (U) và Điểm Cửa Dưới (L)
  const scoreUpper = upperTeamKey === 'home' ? scoreHome : scoreAway;
  const scoreLower = upperTeamKey === 'home' ? scoreAway : scoreHome;

  activeBets.forEach(bet => {
    const player = state.users[bet.userId];
    if (!player) return;

    let isUpperWin = (scoreUpper - H) > scoreLower; // Hiệu số trừ kèo chấp lớn hơn -> Cửa Trên thắng
    // Ví dụ: Brazil (chấp 0.5) vs Argentina. Điểm Brazil = 1, Argentina = 0. U-H = 1-0.5 = 0.5 > L (0) -> Cửa Trên thắng.
    // Nếu Brazil 1, Argentina 1. U-H = 1-0.5 = 0.5 < L (1) -> Cửa Dưới thắng.
    // Vì H là số lẻ bán trái (0.5, 1.5), U - H không bao giờ bằng L. Không có hòa cược!

    let betWon = false;
    if (bet.betSide === 'upper' && isUpperWin) betWon = true;
    if (bet.betSide === 'lower' && !isUpperWin) betWon = true;

    if (betWon) {
      // THẮNG CƯỢC
      const odds = bet.betSide === 'upper' ? match.handicap.oddsUpper : match.handicap.oddsLower;
      const grossWinnings = bet.amount * odds; // Tiền thắng tổng (S)
      const commission = grossWinnings * (platformFeePercent / 100); // Phí sàn
      const netWinnings = grossWinnings - commission; // Thực nhận (S - Phí)
      const totalPayout = bet.amount + netWinnings; // Hoàn gốc + lãi ròng

      // Cập nhật số dư người chơi
      player.balance += totalPayout;
      
      // Chuyển phí sàn vào ví nhà cái
      state.config.systemWalletBalance += commission;

      // Cập nhật trạng thái bet
      bet.status = 'won';
      bet.payout = totalPayout;
      bet.feeDeducted = commission;

      // Ghi lịch sử giao dịch người chơi
      state.transactions.push({
        id: "tx_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        userId: player.id,
        amount: totalPayout,
        type: "win_payout",
        description: `Nhận thanh toán thắng cược trận ${match.homeTeam} vs ${match.awayTeam} (Thắng ròng: +${netWinnings.toFixed(1)} Xu, phí sàn ${platformFeePercent}%)`,
        timestamp: state.simulatedClock
      });

      // Tạo thông báo người chơi
      state.notifications.unshift({
        id: "notif_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        userId: player.id,
        title: "🎉 Bạn đã thắng cược!",
        message: `Kết quả: ${match.homeTeam} ${scoreHome} - ${scoreAway} ${match.awayTeam}. Nhận lại +${totalPayout.toFixed(1)} xu sau khi trừ ${commission.toFixed(1)} xu phí sàn.`,
        type: "success",
        read: false,
        timestamp: state.simulatedClock
      });
      
    } else {
      // THUA CƯỢC
      bet.status = 'lost';
      bet.payout = 0;
      bet.feeDeducted = 0;

      // Tiền cược đóng băng chuyển hẳn vào Quỹ nhà cái
      state.config.systemWalletBalance += bet.amount;

      // Cập nhật lịch sử giao dịch (chỉ ghi nhận tiền cược đã bị khấu trừ hoàn toàn)
      state.transactions.push({
        id: "tx_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        userId: player.id,
        amount: 0,
        type: "loss",
        description: `Thua cược trận ${match.homeTeam} vs ${match.awayTeam} (-${bet.amount} Xu cược gốc)`,
        timestamp: state.simulatedClock
      });

      // Tạo thông báo người chơi
      state.notifications.unshift({
        id: "notif_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        userId: player.id,
        title: "❌ Cược thất bại",
        message: `Kết quả: ${match.homeTeam} ${scoreHome} - ${scoreAway} ${match.awayTeam}. Bạn đã dự đoán sai và bị khấu trừ -${bet.amount} xu.`,
        type: "error",
        read: false,
        timestamp: state.simulatedClock
      });
    }
  });

  saveState();
}

// ----------------------------------------------------
// 4. TIẾN TRÌNH GIẢ LẬP ĐỒNG BỘ (SIMULATION CLOCK & CRON)
// ----------------------------------------------------
function tickSimulatedClock(minutesJump = 5) {
  let currentTime = new Date(state.simulatedClock);
  currentTime.setMinutes(currentTime.getMinutes() + minutesJump);
  state.simulatedClock = currentTime.toISOString();

  // Chạy logic quét trạng thái trận đấu dựa trên giờ mới
  runMatchAutomationSync();
  saveState();
  updateUI();
}

function runMatchAutomationSync() {
  const clock = getSimulatedTime();
  let stateChanged = false;

  state.matches.forEach(match => {
    const matchTime = new Date(match.dateStr);
    const timeDiffMs = matchTime - clock;

    // A. Cơ chế Đóng cổng cược cứng trước giờ đá 5 phút (Risk Management)
    if (match.status === 'upcoming' && timeDiffMs <= 5 * 60 * 1000 && timeDiffMs > 0) {
      // Trận đấu sắp diễn ra trong vòng 5 phút -> Kích hoạt nhắc nhở chưa bet
      triggerBetReminderNotification(match);
    }

    // B. Bắt đầu trận đấu (Upcoming -> Live)
    if (match.status === 'upcoming' && clock >= matchTime) {
      match.status = 'live';
      match.timeElapsed = 0;
      stateChanged = true;

      // Thông báo lịch thi đấu bắt đầu
      triggerMatchStartNotification(match);
      showToast(`⏰ Trận đấu ${match.homeTeam} vs ${match.awayTeam} đã chính thức bắt đầu! Cổng cược bị khóa.`, "info");
    }

    // C. Cập nhật diễn biến trận Live (Mỗi 5 phút simulated time tăng 5 phút thi đấu)
    if (match.status === 'live') {
      const matchElapsed = Math.floor((clock - matchTime) / (60 * 1000));
      match.timeElapsed = Math.min(90, matchElapsed > 0 ? matchElapsed : match.timeElapsed + 5);

      // Giả lập cơ hội ghi bàn ngẫu nhiên (10% cơ hội mỗi đội ghi bàn trong mỗi block 5 phút)
      if (Math.random() < 0.08 && match.timeElapsed < 90) {
        match.homeScore += 1;
        triggerGoalNotification(match, 'home');
      }
      if (Math.random() < 0.08 && match.timeElapsed < 90) {
        match.awayScore += 1;
        triggerGoalNotification(match, 'away');
      }

      // D. Kết thúc trận đấu sau 90 phút thi đấu chính thức
      if (match.timeElapsed >= 90) {
        match.status = 'finished';
        stateChanged = true;
        
        // Kích hoạt engine tính cược tự động trả thưởng
        settleMatchBets(match);
        showToast(`🏁 Trận đấu ${match.homeTeam} vs ${match.awayTeam} đã kết thúc! Kết quả chung cuộc: ${match.homeScore} - ${match.awayScore}`, "success");
      }
    }
  });

  if (stateChanged) {
    saveState();
  }
}

// ----------------------------------------------------
// 5. HỆ THỐNG THÔNG BÁO TỰ ĐỘNG (NOTIFICATION SYSTEM)
// ----------------------------------------------------
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let emoji = "ℹ️";
  if (type === "success") emoji = "🎉";
  if (type === "error") emoji = "❌";

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-title">${emoji} Hệ thống</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  container.appendChild(toast);

  // Tự động xóa sau 4 giây
  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function triggerBetReminderNotification(match) {
  // Gửi thông báo cho những ai CHƯA đặt cược trận này trước 15p (hoặc 5p khóa cược)
  const players = Object.keys(state.users).filter(k => k !== 'admin');
  
  players.forEach(pId => {
    const hasBet = state.bets.some(b => b.matchId === match.id && b.userId === pId);
    if (!hasBet) {
      // Kiểm tra xem đã có thông báo nhắc nhở trận này chưa để tránh spam
      const alreadyNotified = state.notifications.some(
        n => n.userId === pId && n.message.includes(`chốt kèo cho trận đấu ${match.homeTeam}`)
      );
      
      if (!alreadyNotified) {
        state.notifications.unshift({
          id: "notif_rem_" + Date.now() + "_" + pId,
          userId: pId,
          title: "🔥 Nhắc nhở chốt kèo!",
          message: `Chỉ còn ít phút trước khi cổng cược trận đấu ${match.homeTeam} vs ${match.awayTeam} bị khóa. Vào cược ngay kẻo lỡ!`,
          type: "warning",
          read: false,
          timestamp: state.simulatedClock
        });
      }
    }
  });
}

function triggerMatchStartNotification(match) {
  const players = Object.keys(state.users).filter(k => k !== 'admin');
  players.forEach(pId => {
    state.notifications.unshift({
      id: "notif_start_" + Date.now() + "_" + pId,
      userId: pId,
      title: "⏰ Trận đấu bắt đầu",
      message: `⏰ Trận đấu hấp dẫn giữa ${match.homeTeam} vs ${match.awayTeam} đã bắt đầu tại sân ${match.stadium}!`,
      type: "info",
      read: false,
      timestamp: state.simulatedClock
    });
  });
}

function triggerGoalNotification(match, scoringSide) {
  const scoringTeam = scoringSide === 'home' ? match.homeTeam : match.awayTeam;
  const flag = getFlagEmoji(scoringTeam);
  
  // Show toast to active user if it is real-time simulated
  showToast(`⚽ VÀO!!! ${flag} ${scoringTeam} đã ghi bàn! Tỷ số hiện tại: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`, "success");

  // Gửi thông báo hệ thống cho các player đặt cược trận này
  const betters = state.bets.filter(b => b.matchId === match.id && b.status === 'active').map(b => b.userId);
  betters.forEach(pId => {
    state.notifications.unshift({
      id: "notif_goal_" + Date.now() + "_" + pId + "_" + Math.random().toString(36).substr(2,3),
      userId: pId,
      title: `⚽ BÀN THẮNG!!! ${scoringTeam} ghi bàn`,
      message: `Cập nhật tỷ số trận đấu: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}.`,
      type: "info",
      read: false,
      timestamp: state.simulatedClock
    });
  });
}

// ----------------------------------------------------
// 6. TÍCH HỢP THE ODDS API (REAL ODDS CONNECTOR)
// ----------------------------------------------------
async function syncRealOddsFromApi() {
  const apiKey = state.config.apiKey;
  const sport = state.config.oddsApiSport || "soccer_fifaworldcup";
  
  if (!apiKey) {
    showToast("⚠️ Chưa nhập API Key trong Admin. Hệ thống dùng chế độ Mock Odds tự động.", "error");
    runMockOddsSync();
    return;
  }

  showToast("🔄 Đang kết nối The Odds API...", "info");
  const syncDot = document.getElementById("simSyncDot");
  if (syncDot) syncDot.className = "sim-dot syncing";

  try {
    // The Odds API supports pointspreads (Asian Handicap equivalent)
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=spreads`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API Error response: ${response.status}`);
    }
    const data = await response.json();
    
    if (data.length === 0) {
      showToast("⚠️ Không tìm thấy trận đấu nào đang mở kèo chấp từ API.", "warning");
      return;
    }

    // Tiến hành parse và đồng bộ các trận đấu
    let countSynced = 0;
    data.forEach(event => {
      // Tìm bookmaker Bovada hoặc DraftKings hoặc Bovada để lấy spreads
      const bookmaker = event.bookmakers.find(b => b.key === 'bovada' || b.key === 'draftkings' || b.key === 'betrivers') || event.bookmakers[0];
      if (!bookmaker) return;

      const market = bookmaker.markets.find(m => m.key === 'spreads');
      if (!market || market.outcomes.length < 2) return;

      // Lấy tỷ lệ chấp và Odds của hai đội
      const outcomeHome = market.outcomes.find(o => o.name === event.home_team);
      const outcomeAway = market.outcomes.find(o => o.name === event.away_team);
      if (!outcomeHome || !outcomeAway) return;

      // Lấy kèo chấp (point) của Đội Nhà
      let pointHome = parseFloat(outcomeHome.point);
      let upperTeamId = "home";
      let handicapValue = Math.abs(pointHome);

      if (pointHome < 0) {
        // Đội nhà chấp (kèo âm)
        upperTeamId = "home";
      } else if (pointHome > 0) {
        // Đội khách chấp
        upperTeamId = "away";
      } else {
        // Kèo đồng banh (point = 0) -> Đảm bảo không có kịch bản hòa kèo:
        // Tự động làm tròn thành chấp 0.5 để bắt buộc có đội thắng/thua
        upperTeamId = Math.random() > 0.5 ? "home" : "away";
        handicapValue = 0.5;
      }

      // Đảm bảo kèo chấp luôn là số lẻ bán trái (ví dụ point = -1 -> chuyển thành -1.5 hoặc -0.5)
      // Nếu handicapValue là số nguyên, tự động đổi thành số lẻ để loại bỏ hòa cược
      if (Number.isInteger(handicapValue)) {
        handicapValue = handicapValue + 0.5;
      }

      // Decimal odds (vd: 1.95) chuyển thành Net odds của hệ thống (0.95)
      const oddsUpper = parseFloat(upperTeamId === 'home' ? outcomeHome.price : outcomeAway.price) - 1;
      const oddsLower = parseFloat(upperTeamId === 'home' ? outcomeAway.price : outcomeHome.price) - 1;

      // Tìm trận đấu hiện tại trong state hoặc tạo mới nếu chưa có
      let existingMatch = state.matches.find(m => 
        (m.homeTeam.toLowerCase() === event.home_team.toLowerCase() || event.home_team.toLowerCase().includes(m.homeTeam.toLowerCase()))
      );

      if (existingMatch) {
        // Cập nhật kèo chấp thực tế
        existingMatch.handicap = {
          upperTeamId: upperTeamId,
          value: handicapValue,
          oddsUpper: parseFloat(oddsUpper.toFixed(2)),
          oddsLower: parseFloat(oddsLower.toFixed(2))
        };
        countSynced++;
      } else {
        // Thêm trận đấu mới tinh từ API
        state.matches.push({
          id: "api_" + event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          stadium: "Sân vận động Quốc tế",
          dateStr: event.commence_time,
          status: "upcoming",
          homeScore: 0,
          awayScore: 0,
          handicap: {
            upperTeamId: upperTeamId,
            value: handicapValue,
            oddsUpper: parseFloat(oddsUpper.toFixed(2)),
            oddsLower: parseFloat(oddsLower.toFixed(2))
          },
          timeElapsed: 0
        });
        countSynced++;
      }
    });

    state.config.lastSyncTime = new Date().toISOString();
    saveState();
    updateUI();
    showToast(`🔄 Đồng bộ thành công ${countSynced} trận & tỷ lệ kèo chấp từ API!`, "success");

  } catch (error) {
    console.error("Lỗi gọi API Odds:", error);
    showToast("❌ Không thể đồng bộ từ API (Lỗi kết nối / Hết lượt gọi).", "error");
  } finally {
    if (syncDot) syncDot.className = "sim-dot";
  }
}

// Giả lập đồng bộ cược (Cấp số cược chấp ngẫu nhiên cho trận đấu mới)
function runMockOddsSync() {
  state.matches.forEach(m => {
    if (m.status === 'upcoming') {
      // Đổi ngẫu nhiên odds để tăng tính sinh động
      m.handicap.oddsUpper = parseFloat((0.8 + Math.random() * 0.2).toFixed(2));
      m.handicap.oddsLower = parseFloat((0.8 + Math.random() * 0.2).toFixed(2));
    }
  });
  state.config.lastSyncTime = new Date().toISOString();
  saveState();
  updateUI();
  showToast("🔄 Đồng bộ dữ liệu Mock Odds hoàn thành!", "success");
}

// ----------------------------------------------------
// 7. QUẢN LÝ VÍ & GIAO DỊCH (WALLET & CASHIER)
// ----------------------------------------------------
function executeDeposit(userId, amount, description) {
  const user = state.users[userId];
  if (!user) {
    showToast("❌ Người dùng không tồn tại!", "error");
    return false;
  }

  user.balance += amount;

  // Ghi nhận lịch sử giao dịch ví
  state.transactions.unshift({
    id: "tx_" + Date.now(),
    userId: user.id,
    amount: amount,
    type: "deposit",
    description: description || "Nạp tiền vào tài khoản",
    timestamp: state.simulatedClock
  });

  // Tạo thông báo cho người chơi
  state.notifications.unshift({
    id: "notif_" + Date.now(),
    userId: user.id,
    title: "💰 Số dư biến động (+)",
    message: `Tài khoản của bạn đã được cộng +${amount} xu. Lý do: ${description}`,
    type: "success",
    read: false,
    timestamp: state.simulatedClock
  });

  saveState();
  updateUI();
  showToast(`💰 Đã nạp thành công +${amount} Xu cho ${user.username}!`, "success");
  return true;
}

// ----------------------------------------------------
// 8. ĐIỀU HƯỚNG CÁC TAB VIEW (ROUTING INTERFACE)
// ----------------------------------------------------
function setupTabNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const targetId = item.getAttribute('data-target');
      
      // Toggle nav active
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Toggle views display
      sections.forEach(sec => {
        if (sec.id === targetId) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });

      // Update specific components if needed
      updateUI();
    });
  });
}

// ----------------------------------------------------
// 9. CORE RENDERING ENGINE (CẬP NHẬT UI TOÀN CỤC)
// ----------------------------------------------------
function updateUI() {
  const currentUser = state.users[state.currentUser];
  if (!currentUser) return;

  // A. Cập nhật Sidebar Profile
  document.getElementById("userAvatar").src = currentUser.avatar;
  document.getElementById("userName").textContent = currentUser.username;
  document.getElementById("userRole").textContent = currentUser.role.toUpperCase();
  
  // Tính tiền đóng băng hiện tại của user từ các cược đang active
  const userActiveBets = state.bets.filter(b => b.userId === currentUser.id && b.status === 'active');
  const frozenAmount = userActiveBets.reduce((acc, curr) => acc + curr.amount, 0);
  
  document.getElementById("userBalance").textContent = currentUser.balance.toLocaleString('vi-VN');
  document.getElementById("userFrozenBalance").textContent = frozenAmount.toLocaleString('vi-VN');

  // B. Ẩn/Hiện Tab Admin dựa trên quyền
  const navAdminLink = document.getElementById("navAdminLink");
  const simBanner = document.getElementById("simulatorBanner");
  if (currentUser.role === 'admin') {
    navAdminLink.style.display = 'flex';
    if (simBanner) simBanner.style.display = 'flex';
  } else {
    navAdminLink.style.display = 'none';
    if (simBanner) simBanner.style.display = 'none';
    // Nếu user thông thường đang ở tab admin, đẩy họ về tab match center
    const adminSec = document.getElementById("admin-console");
    if (adminSec && adminSec.classList.contains('active')) {
      document.querySelector('.nav-item[data-target="match-center"]').click();
    }
  }

  // C. Render Wallet View
  document.getElementById("walletAvailableBalance").textContent = currentUser.balance.toLocaleString('vi-VN');
  document.getElementById("walletFrozenBalance").textContent = frozenAmount.toLocaleString('vi-VN');
  document.getElementById("walletTotalBalance").textContent = (currentUser.balance + frozenAmount).toLocaleString('vi-VN');

  // Giao dịch ví
  const txListElement = document.getElementById("transactionsList");
  txListElement.innerHTML = "";
  
  const userTxs = state.transactions.filter(t => t.userId === currentUser.id);
  if (userTxs.length === 0) {
    txListElement.innerHTML = `<li style="color:var(--color-text-dark); text-align:center; padding: 20px;">Chưa có giao dịch nào phát sinh.</li>`;
  } else {
    userTxs.forEach(tx => {
      const li = document.createElement("li");
      li.className = "transaction-item";
      
      let amountClass = "negative";
      let prefix = "";
      if (tx.amount > 0) {
        amountClass = "positive";
        prefix = "+";
      } else if (tx.amount === 0 && tx.type === 'loss') {
        amountClass = "negative";
        prefix = "";
      } else if (tx.type === 'bet_freeze') {
        amountClass = "frozen-tx";
      }

      li.innerHTML = `
        <div class="tx-main">
          <div class="tx-desc">${tx.description}</div>
          <div class="tx-time">${formatDateTime(tx.timestamp)}</div>
        </div>
        <div class="tx-value ${amountClass}">${prefix}${tx.amount.toLocaleString('vi-VN')} Xu</div>
      `;
      txListElement.appendChild(li);
    });
  }

  // D. Render Match Center Cards
  renderMatchCenterCards();

  // E. Render Rooms & Leaderboard View
  renderRoomsView();

  // F. Render Admin Panel Controls
  renderAdminPanel();

  // G. Render Notifications Bell Badge
  renderNotificationBell();
}

// Render Match Cards in Match Center
function renderMatchCenterCards() {
  const grid = document.getElementById("matchesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  // Tìm bộ lọc tích cực
  const activeFilterBtn = document.querySelector('.filter-tab.active');
  const filter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';

  let filteredMatches = state.matches;
  const clock = getSimulatedTime();

  if (filter === 'upcoming') {
    filteredMatches = state.matches.filter(m => m.status === 'upcoming');
  } else if (filter === 'live') {
    filteredMatches = state.matches.filter(m => m.status === 'live');
  } else if (filter === 'finished') {
    filteredMatches = state.matches.filter(m => m.status === 'finished');
  }

  // Sắp xếp các trận: Trận LIVE lên đầu, rồi tới Trận Upcoming gần nhất
  filteredMatches.sort((a, b) => {
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (a.status !== 'live' && b.status === 'live') return 1;
    return new Date(a.dateStr) - new Date(b.dateStr);
  });

  if (filteredMatches.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--color-text-muted);">Không có trận đấu nào trong danh mục này.</div>`;
    return;
  }

  filteredMatches.forEach(match => {
    const card = document.createElement("div");
    card.className = "match-card";

    const { upperTeamName, lowerTeamName, upperFlag, lowerFlag, upperTeamKey } = getUpperLowerTeams(match);
    
    // Kiểm tra xem người dùng hiện tại đã đặt cược trận này chưa
    const userBet = state.bets.find(b => b.matchId === match.id && b.userId === state.currentUser);
    let betInfoHtml = "";
    if (userBet) {
      const selectedSideName = userBet.betSide === 'upper' ? upperTeamName : lowerTeamName;
      const statusText = userBet.status === 'active' ? "Đang khóa (Chờ kết quả)" : (userBet.status === 'won' ? "Thắng 🎉" : "Thua ❌");
      const payoutText = userBet.status === 'won' ? ` (+${userBet.payout.toFixed(1)} xu)` : "";
      
      betInfoHtml = `
        <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--border-radius-sm); padding: 8px 12px; margin-bottom: 12px; font-size: 0.75rem; color: #fbd38d;">
          🎫 Đã cược: <strong>${userBet.amount} Xu</strong> vào cửa <strong>${selectedSideName}</strong><br>
          Trạng thái: <strong>${statusText}</strong>${payoutText}
        </div>
      `;
    }

    // Thiết lập Trạng thái Button Đặt cược
    let buttonText = "👉 Đặt Cược Kèo Chấp";
    let isBtnDisabled = false;

    const matchTime = new Date(match.dateStr);
    const timeDiffMins = (matchTime - clock) / (60 * 1000);

    if (match.status === 'finished') {
      buttonText = "🏁 Đã Kết Thúc";
      isBtnDisabled = true;
    } else if (match.status === 'live') {
      buttonText = "🔒 Đang Thi Đấu (Khóa Cược)";
      isBtnDisabled = true;
    } else if (timeDiffMins <= 5) {
      // Risk management lock (5 mins before kick-off)
      buttonText = "🔒 Khóa Kèo (Sắp đá < 5p)";
      isBtnDisabled = true;
    } else if (userBet) {
      buttonText = "✓ Đã Đặt Cược";
      isBtnDisabled = true;
    }

    // Badge thời gian
    let timeBadgeText = formatDateTime(match.dateStr);
    if (match.status === 'live') {
      timeBadgeText = `Đang Live - Phút ${match.timeElapsed}'`;
    } else if (match.status === 'finished') {
      timeBadgeText = "Hết giờ (FT)";
    }

    card.innerHTML = `
      <div class="card-meta">
        <span class="stadium-badge">🏟️ ${match.stadium}</span>
        <span class="status-badge ${match.status}">${timeBadgeText}</span>
      </div>

      <div class="versus-section">
        <div class="team-display">
          <span class="team-flag">${getFlagEmoji(match.homeTeam)}</span>
          <span class="team-name ${match.handicap.upperTeamId === 'home' ? 'handicap-upper' : ''}">${match.homeTeam}</span>
        </div>
        
        <div class="score-display">
          <span>${match.homeScore}</span>
          <span class="score-divider">:</span>
          <span>${match.awayScore}</span>
        </div>

        <div class="team-display">
          <span class="team-flag">${getFlagEmoji(match.awayTeam)}</span>
          <span class="team-name ${match.handicap.upperTeamId === 'away' ? 'handicap-upper' : ''}">${match.awayTeam}</span>
        </div>
      </div>

      <div class="odds-box">
        <div class="odds-row">
          <span class="odds-label">Đội chấp cửa trên:</span>
          <span class="odds-value highlight">${upperTeamName}</span>
        </div>
        <div class="odds-row">
          <span class="odds-label">Tỷ lệ Kèo chấp:</span>
          <span class="odds-value handicap-val">Chấp ${match.handicap.value} trái</span>
        </div>
        <div class="odds-row" style="border-top: 1px solid rgba(255,255,255,0.03); padding-top: 6px; margin-top: 6px;">
          <span class="odds-label">Odds ăn Cửa Trên:</span>
          <span class="odds-value">x${match.handicap.oddsUpper}</span>
        </div>
        <div class="odds-row">
          <span class="odds-label">Odds ăn Cửa Dưới:</span>
          <span class="odds-value">x${match.handicap.oddsLower}</span>
        </div>
      </div>

      ${betInfoHtml}

      <button class="bet-action-btn" id="btnBetMatch_${match.id}" ${isBtnDisabled ? 'disabled' : ''}>
        ${buttonText}
      </button>
    `;

    grid.appendChild(card);

    // Click handler mở Modal cược
    if (!isBtnDisabled) {
      const btn = card.querySelector(`#btnBetMatch_${match.id}`);
      btn.addEventListener('click', () => {
        openBettingModal(match);
      });
    }
  });
}

// Render Rooms & Leaderboards view
let activeRoomId = "GLOBAL";
function renderRoomsView() {
  const roomsListEl = document.getElementById("userRoomsList");
  if (!roomsListEl) return;
  roomsListEl.innerHTML = "";

  const currentUser = state.users[state.currentUser];
  
  // Danh sách các phòng mà user tham gia hoặc làm chủ
  const joinedRooms = Object.values(state.rooms).filter(
    r => r.members.includes(currentUser.id) || r.ownerId === currentUser.id
  );

  joinedRooms.forEach(room => {
    const activeClass = room.id === activeRoomId ? 'active' : '';
    const roomCard = document.createElement("div");
    roomCard.className = `room-item-card ${activeClass}`;
    
    roomCard.innerHTML = `
      <div class="room-item-header">
        <span class="room-item-name">${room.name}</span>
        <span class="room-item-type ${room.type}">${room.type === 'internal' ? 'Tổng' : 'Custom'}</span>
      </div>
      <div class="room-item-footer">
        <span>Thành viên: ${room.members.length}</span>
        <span>Mã: ${room.code}</span>
      </div>
    `;

    roomCard.addEventListener('click', () => {
      activeRoomId = room.id;
      updateUI();
    });

    roomsListEl.appendChild(roomCard);
  });

  // Render bảng xếp hạng của Phòng được chọn
  const activeRoom = state.rooms[activeRoomId];
  if (!activeRoom) return;

  document.getElementById("activeRoomName").textContent = activeRoom.name;
  document.getElementById("activeRoomCode").textContent = activeRoom.code;

  // Quyền quản lý phòng
  const roomAdminActions = document.getElementById("roomAdminActions");
  const pendingRequestsBox = document.getElementById("pendingRequestsBox");
  
  if (activeRoom.ownerId === currentUser.id && activeRoom.type === 'custom') {
    roomAdminActions.style.display = 'flex';
    
    // Hiển thị số lượng yêu cầu chờ duyệt
    const reqCount = activeRoom.pendingRequests ? activeRoom.pendingRequests.length : 0;
    roomAdminActions.innerHTML = `
      <span class="btn btn-small gold">👑 Chủ phòng</span>
      ${reqCount > 0 ? `<span class="status-badge live" style="padding: 6px 10px;">Có ${reqCount} yêu cầu duyệt</span>` : ''}
    `;

    // Render danh sách chờ duyệt
    if (reqCount > 0) {
      pendingRequestsBox.style.display = 'block';
      const reqListEl = document.getElementById("pendingRequestsList");
      reqListEl.innerHTML = "";

      activeRoom.pendingRequests.forEach(reqUserId => {
        const reqUser = state.users[reqUserId];
        if (!reqUser) return;

        const row = document.createElement("div");
        row.className = "request-item";
        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${reqUser.avatar}" class="leaderboard-avatar" />
            <span style="font-size:0.85rem; font-weight:600;">${reqUser.username}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-small primary" id="btnApprove_${reqUserId}">Duyệt</button>
            <button class="btn btn-small danger" id="btnReject_${reqUserId}">Từ chối</button>
          </div>
        `;

        row.querySelector(`#btnApprove_${reqUserId}`).addEventListener('click', () => {
          approveRoomJoinRequest(activeRoom.id, reqUserId);
        });
        row.querySelector(`#btnReject_${reqUserId}`).addEventListener('click', () => {
          rejectRoomJoinRequest(activeRoom.id, reqUserId);
        });

        reqListEl.appendChild(row);
      });
    } else {
      pendingRequestsBox.style.display = 'none';
    }

  } else {
    roomAdminActions.style.display = 'none';
    pendingRequestsBox.style.display = 'none';
  }

  // Render Leaderboard list
  const lbListEl = document.getElementById("leaderboardList");
  lbListEl.innerHTML = "";

  // Tính điểm bảng xếp hạng dựa trên tổng tài sản của người chơi (balance + frozen_balance)
  const roomMembers = activeRoom.members.map(mId => {
    const user = state.users[mId];
    if (!user) return null;
    
    const userBets = state.bets.filter(b => b.userId === mId && b.status === 'active');
    const frozen = userBets.reduce((acc, curr) => acc + curr.amount, 0);
    const totalAssets = user.balance + frozen;

    return {
      username: user.username,
      avatar: user.avatar,
      points: totalAssets // Dùng tổng tài sản làm điểm rank
    };
  }).filter(Boolean);

  // Sắp xếp từ cao xuống thấp
  roomMembers.sort((a, b) => b.points - a.points);

  roomMembers.forEach((member, index) => {
    const rank = index + 1;
    let rankClass = "rank-other";
    if (rank === 1) rankClass = "rank-1";
    else if (rank === 2) rankClass = "rank-2";
    else if (rank === 3) rankClass = "rank-3";

    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `
      <div class="rank-badge ${rankClass}">${rank}</div>
      <div class="leaderboard-user">
        <img src="${member.avatar}" alt="Avatar" class="leaderboard-avatar">
        <span class="leaderboard-username">${member.username}</span>
      </div>
      <div class="leaderboard-points">${member.points.toLocaleString('vi-VN')} Xu</div>
    `;
    lbListEl.appendChild(row);
  });
}

// Render Admin Control Panel
function renderAdminPanel() {
  const currentUser = state.users[state.currentUser];
  if (currentUser.role !== 'admin') return;

  // A. Hiển thị kinh tế sàn
  document.getElementById("adminSystemWallet").textContent = state.config.systemWalletBalance.toLocaleString('vi-VN') + " Xu";
  
  // Tính tổng hoa hồng
  const totalCommission = state.transactions
    .filter(t => t.type === 'win_payout' && t.description.includes('phí sàn'))
    .reduce((acc, curr) => {
      // Phí sàn được lưu trong feeDeducted của bets
      return acc;
    }, 0);
  
  // Thay vào đó quét trực tiếp tất cả bets thắng để lấy phí chính xác
  const totalCommFromBets = state.bets
    .filter(b => b.status === 'won')
    .reduce((acc, curr) => acc + (curr.feeDeducted || 0), 0);

  document.getElementById("adminTotalCommission").textContent = totalCommFromBets.toFixed(1) + " Xu";
  document.getElementById("adminFeeDisplay").textContent = state.config.platformFee + "%";

  // Cài đặt inputs
  document.getElementById("inputPlatformFee").value = state.config.platformFee;
  document.getElementById("inputOddsApiKey").value = state.config.apiKey;
  document.getElementById("selectOddsApiSport").value = state.config.oddsApiSport || "soccer_uefa_champs_league";

  // B. Dropdown nạp xu người chơi
  const depUserSelect = document.getElementById("selectDepositUser");
  depUserSelect.innerHTML = "";
  Object.values(state.users).forEach(u => {
    if (u.role !== 'admin') {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = `${u.username} (Ví: ${u.balance} Xu)`;
      depUserSelect.appendChild(opt);
    }
  });

  // C. Render Admin Matches Management Table
  const tableBody = document.getElementById("adminMatchesTableBody");
  tableBody.innerHTML = "";

  state.matches.forEach(match => {
    const tr = document.createElement("tr");
    const { upperTeamName, upperTeamKey } = getUpperLowerTeams(match);

    let statusText = match.status;
    let badgeColor = "gray";
    if (match.status === 'live') {
      statusText = "🔴 LIVE";
      badgeColor = "red";
    } else if (match.status === 'finished') {
      statusText = "FT (Kết thúc)";
      badgeColor = "green";
    }

    tr.innerHTML = `
      <td>
        <strong style="color:var(--color-text-main);">${match.homeTeam} vs ${match.awayTeam}</strong><br>
        <span style="font-size:0.7rem; color:var(--color-text-dark);">${formatDateTime(match.dateStr)}</span>
      </td>
      <td>${upperTeamName} (${upperTeamKey === 'home' ? 'Nhà' : 'Khách'})</td>
      <td style="color:var(--accent-red); font-weight:700;">${match.handicap.value}</td>
      <td style="font-family:monospace;">${match.handicap.oddsUpper} / ${match.handicap.oddsLower}</td>
      <td>
        <span class="status-badge ${match.status}" style="font-size:0.65rem; padding:2px 6px;">${statusText}</span>
      </td>
      <td>
        <button class="btn btn-small primary" id="btnEditMatchAdmin_${match.id}">Sửa / FT</button>
      </td>
    `;

    tr.querySelector(`#btnEditMatchAdmin_${match.id}`).addEventListener('click', () => {
      openEditMatchModal(match);
    });

    tableBody.appendChild(tr);
  });
}

// Render Notification Center bell dropdown
function renderNotificationBell() {
  const countBadge = document.getElementById("notifBadgeCount");
  const dropdownList = document.getElementById("notifDropdownList");
  if (!countBadge || !dropdownList) return;

  const currentUser = state.users[state.currentUser];
  const userNotifs = state.notifications.filter(n => n.userId === currentUser.id);
  const unreadCount = userNotifs.filter(n => !n.read).length;

  if (unreadCount > 0) {
    countBadge.textContent = unreadCount;
    countBadge.style.display = 'flex';
  } else {
    countBadge.style.display = 'none';
  }

  dropdownList.innerHTML = "";
  if (userNotifs.length === 0) {
    dropdownList.innerHTML = `<li style="padding: 16px; text-align:center; color:var(--color-text-dark); font-size:0.75rem;">Không có thông báo nào.</li>`;
    return;
  }

  // Lấy tối đa 5 thông báo gần nhất
  userNotifs.slice(0, 5).forEach(notif => {
    const li = document.createElement("li");
    li.className = `notif-dropdown-item ${notif.read ? '' : 'unread'}`;
    
    let icon = "🔔";
    if (notif.type === 'success') icon = "🎉";
    if (notif.type === 'error') icon = "❌";
    if (notif.type === 'warning') icon = "⚠️";

    li.innerHTML = `
      <div class="notif-dropdown-title">
        <span>${icon}</span>
        <strong>${notif.title}</strong>
      </div>
      <div class="notif-dropdown-desc">${notif.message}</div>
      <div class="notif-dropdown-time">${formatDateTime(notif.timestamp)}</div>
    `;

    li.addEventListener('click', () => {
      notif.read = true;
      saveState();
      updateUI();
    });

    dropdownList.appendChild(li);
  });
}

// ----------------------------------------------------
// 10. XỬ LÝ SỰ KIỆN CUSTOM ROOMS
// ----------------------------------------------------
function approveRoomJoinRequest(roomId, reqUserId) {
  const room = state.rooms[roomId];
  if (!room) return;

  // Thêm thành viên
  if (!room.members.includes(reqUserId)) {
    room.members.push(reqUserId);
  }

  // Xóa yêu cầu chờ duyệt
  room.pendingRequests = room.pendingRequests.filter(id => id !== reqUserId);

  // Tạo thông báo cho người chơi được duyệt
  state.notifications.unshift({
    id: "notif_appr_" + Date.now(),
    userId: reqUserId,
    title: "🎉 Bạn đã được duyệt vào phòng!",
    message: `Yêu cầu tham gia phòng "${room.name}" của bạn đã được chủ phòng phê duyệt.`,
    type: "success",
    read: false,
    timestamp: state.simulatedClock
  });

  saveState();
  updateUI();
  showToast("✓ Đã phê duyệt yêu cầu tham gia phòng!", "success");
}

function rejectRoomJoinRequest(roomId, reqUserId) {
  const room = state.rooms[roomId];
  if (!room) return;

  // Xóa yêu cầu chờ duyệt
  room.pendingRequests = room.pendingRequests.filter(id => id !== reqUserId);

  // Tạo thông báo cho người chơi bị từ chối
  state.notifications.unshift({
    id: "notif_rej_" + Date.now(),
    userId: reqUserId,
    title: "⚠️ Từ chối vào phòng",
    message: `Chủ phòng đã từ chối yêu cầu tham gia phòng "${room.name}" của bạn.`,
    type: "warning",
    read: false,
    timestamp: state.simulatedClock
  });

  saveState();
  updateUI();
  showToast("⚠️ Đã từ chối yêu cầu tham gia phòng.", "warning");
}

function createCustomRoom(name, approvalRequired) {
  if (!name.trim()) {
    showToast("❌ Vui lòng nhập tên phòng!", "error");
    return;
  }

  const currentUser = state.users[state.currentUser];
  
  // Tạo mã Code 6 chữ cái viết hoa ngẫu nhiên
  let code = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const roomId = "room_" + Date.now();
  state.rooms[roomId] = {
    id: roomId,
    name: name.trim(),
    code: code,
    ownerId: currentUser.id,
    approvalRequired: approvalRequired,
    members: [currentUser.id],
    pendingRequests: [],
    type: "custom"
  };

  activeRoomId = roomId; // Tự chuyển hướng sang phòng vừa tạo
  saveState();
  updateUI();
  showToast(`🎉 Đã tạo thành công phòng cược "${name}" với mã code: ${code}`, "success");
  
  // Đóng Modal
  document.getElementById("createRoomModalOverlay").classList.remove("active");
}

function requestJoinCustomRoom(code) {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    showToast("❌ Vui lòng nhập mã Room Code!", "error");
    return;
  }

  const room = Object.values(state.rooms).find(r => r.code === cleanCode);
  if (!room) {
    showToast("❌ Không tìm thấy phòng nào có mã Code này!", "error");
    return;
  }

  const currentUser = state.users[state.currentUser];

  if (room.members.includes(currentUser.id)) {
    showToast("✓ Bạn đã là thành viên của phòng này rồi!", "info");
    activeRoomId = room.id;
    updateUI();
    document.getElementById("joinRoomModalOverlay").classList.remove("active");
    return;
  }

  if (room.pendingRequests && room.pendingRequests.includes(currentUser.id)) {
    showToast("🕒 Bạn đã gửi yêu cầu tham gia phòng này rồi. Vui lòng chờ phê duyệt!", "info");
    document.getElementById("joinRoomModalOverlay").classList.remove("active");
    return;
  }

  if (room.approvalRequired) {
    if (!room.pendingRequests) room.pendingRequests = [];
    room.pendingRequests.push(currentUser.id);
    
    // Tạo thông báo cho chủ phòng
    state.notifications.unshift({
      id: "notif_req_" + Date.now(),
      userId: room.ownerId,
      title: "📩 Yêu cầu duyệt thành viên",
      message: `Người chơi ${currentUser.username} muốn xin tham gia phòng "${room.name}".`,
      type: "info",
      read: false,
      timestamp: state.simulatedClock
    });

    saveState();
    updateUI();
    showToast("🕒 Đã gửi yêu cầu vào phòng. Chờ chủ phòng duyệt!", "info");
  } else {
    room.members.push(currentUser.id);
    activeRoomId = room.id;
    
    saveState();
    updateUI();
    showToast(`🎉 Tham gia thành công phòng cược "${room.name}"!`, "success");
  }

  document.getElementById("joinRoomModalOverlay").classList.remove("active");
}

// ----------------------------------------------------
// 11. XỬ LÝ ĐẶT CƯỢC (BET MODAL ACTIONS)
// ----------------------------------------------------
let selectedBetMatch = null;
let selectedBetSide = null; // 'upper' hoặc 'lower'

function openBettingModal(match) {
  selectedBetMatch = match;
  selectedBetSide = null; // reset

  const { upperTeamName, lowerTeamName } = getUpperLowerTeams(match);

  document.getElementById("betModalMatchStadium").textContent = `🏟️ Sân: ${match.stadium}`;
  document.getElementById("betModalMatchVersus").textContent = `${match.homeTeam} vs ${match.awayTeam}`;
  document.getElementById("betModalMatchHandicap").textContent = `🔥 Kèo chấp: Đội cửa trên (${upperTeamName}) chấp -${match.handicap.value} trái`;

  // Thiết lập tên cửa đặt cược
  document.getElementById("betModalUpperTeamName").textContent = upperTeamName;
  document.getElementById("betModalUpperOdds").textContent = `Odds: x${match.handicap.oddsUpper}`;

  document.getElementById("betModalLowerTeamName").textContent = lowerTeamName;
  document.getElementById("betModalLowerOdds").textContent = `Odds: x${match.handicap.oddsLower}`;

  // Số dư khả dụng
  const currentUser = state.users[state.currentUser];
  document.getElementById("betModalAvailBalance").textContent = currentUser.balance.toLocaleString('vi-VN');

  // Reset Form
  const amountInput = document.getElementById("inputBetAmount");
  amountInput.value = "";
  document.getElementById("btnBetSideUpper").classList.remove("selected");
  document.getElementById("btnBetSideLower").classList.remove("selected");
  document.getElementById("btnSubmitBet").disabled = true;

  resetBetSummaryDisplay();

  // Mở modal overlay
  document.getElementById("betModalOverlay").classList.add("active");
}

function resetBetSummaryDisplay() {
  document.getElementById("summaryBetAmount").textContent = "0 Xu";
  document.getElementById("summaryOdds").textContent = "0.00";
  document.getElementById("summaryFeeVal").textContent = "0 Xu";
  document.getElementById("summaryWinnings").textContent = "0 Xu";
  document.getElementById("summaryFeePercent").textContent = state.config.platformFee;
}

function updateBetSummary() {
  if (!selectedBetMatch || !selectedBetSide) {
    resetBetSummaryDisplay();
    return;
  }

  const amountInput = document.getElementById("inputBetAmount");
  const amount = parseInt(amountInput.value) || 0;
  
  const odds = selectedBetSide === 'upper' ? selectedBetMatch.handicap.oddsUpper : selectedBetMatch.handicap.oddsLower;
  const platformFee = parseFloat(state.config.platformFee);

  const grossWinnings = amount * odds;
  const fee = grossWinnings * (platformFee / 100);
  const netWinnings = grossWinnings - fee;
  const expectedPayout = amount + netWinnings;

  document.getElementById("summaryBetAmount").textContent = amount.toLocaleString('vi-VN') + " Xu";
  document.getElementById("summaryOdds").textContent = `x${odds}`;
  document.getElementById("summaryFeeVal").textContent = fee.toFixed(1) + " Xu";
  
  if (amount > 0) {
    document.getElementById("summaryWinnings").textContent = expectedPayout.toFixed(1) + " Xu";
  } else {
    document.getElementById("summaryWinnings").textContent = "0 Xu";
  }

  // Validate xem cược có hợp lệ
  const currentUser = state.users[state.currentUser];
  const btnSubmit = document.getElementById("btnSubmitBet");
  
  if (amount >= 10 && amount <= currentUser.balance) {
    btnSubmit.disabled = false;
  } else {
    btnSubmit.disabled = true;
  }
}

function processBetSubmit() {
  const currentUser = state.users[state.currentUser];
  const amountInput = document.getElementById("inputBetAmount");
  const amount = parseInt(amountInput.value) || 0;

  if (!selectedBetMatch || !selectedBetSide || amount <= 0) return;

  if (amount > currentUser.balance) {
    showToast("❌ Số dư khả dụng của bạn không đủ!", "error");
    return;
  }

  // Khấu trừ khả dụng người chơi (Không bị trừ mất hẳn, chỉ chuyển sang đóng băng ở UI)
  currentUser.balance -= amount;

  // Tạo Bet mới
  const betId = "bet_" + Date.now();
  state.bets.push({
    id: betId,
    matchId: selectedBetMatch.id,
    userId: currentUser.id,
    betSide: selectedBetSide,
    amount: amount,
    status: "active",
    payout: 0,
    feeDeducted: 0,
    timestamp: state.simulatedClock
  });

  // Ghi lịch sử ví: Đóng băng cược
  state.transactions.unshift({
    id: "tx_" + Date.now(),
    userId: currentUser.id,
    amount: -amount,
    type: "bet_freeze",
    description: `Đóng băng đặt cược cửa ${selectedBetSide === 'upper' ? 'Trên' : 'Dưới'} trận ${selectedBetMatch.homeTeam} vs ${selectedBetMatch.awayTeam}`,
    timestamp: state.simulatedClock
  });

  // Lưu và cập nhật
  saveState();
  updateUI();

  const teamChoiceName = selectedBetSide === 'upper' ? 
    getUpperLowerTeams(selectedBetMatch).upperTeamName : 
    getUpperLowerTeams(selectedBetMatch).lowerTeamName;

  showToast(`🎫 Đã nhận cược ${amount} Xu vào cửa ${teamChoiceName}!`, "success");

  // Đóng modal
  document.getElementById("betModalOverlay").classList.remove("active");
}

// ----------------------------------------------------
// 12. ADMIN EDIT MATCH DIALOG
// ----------------------------------------------------
function openEditMatchModal(match) {
  document.getElementById("editMatchId").value = match.id;
  document.getElementById("editMatchTeams").textContent = `${match.homeTeam} vs ${match.awayTeam}`;
  document.getElementById("editMatchStatus").value = match.status;
  document.getElementById("editHomeScore").value = match.homeScore;
  document.getElementById("editAwayScore").value = match.awayScore;

  // Label scores
  document.getElementById("editLabelHomeScore").textContent = `Bàn thắng ${match.homeTeam}`;
  document.getElementById("editLabelAwayScore").textContent = `Bàn thắng ${match.awayTeam}`;

  // Handicap settings
  document.getElementById("editHandicapTeam").value = match.handicap.upperTeamId;
  document.getElementById("editHandicapVal").value = match.handicap.value;
  document.getElementById("editOddsUpper").value = match.handicap.oddsUpper;
  document.getElementById("editOddsLower").value = match.handicap.oddsLower;

  document.getElementById("editMatchModalOverlay").classList.add("active");
}

function processEditMatchSubmit() {
  const matchId = document.getElementById("editMatchId").value;
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;

  const oldStatus = match.status;
  const newStatus = document.getElementById("editMatchStatus").value;

  match.status = newStatus;
  match.homeScore = parseInt(document.getElementById("editHomeScore").value) || 0;
  match.awayScore = parseInt(document.getElementById("editAwayScore").value) || 0;
  match.handicap.upperTeamId = document.getElementById("editHandicapTeam").value;
  match.handicap.value = parseFloat(document.getElementById("editHandicapVal").value);
  match.handicap.oddsUpper = parseFloat(document.getElementById("editOddsUpper").value);
  match.handicap.oddsLower = parseFloat(document.getElementById("editOddsLower").value);

  // Phân xử cược nếu chuyển trạng thái sang Finished
  if (oldStatus !== 'finished' && newStatus === 'finished') {
    settleMatchBets(match);
    showToast(`🏁 Trận đấu ${match.homeTeam} vs ${match.awayTeam} đã được Admin chuyển sang Kết Thúc & Trả thưởng.`, "success");
  } else {
    showToast(`🏟️ Đã cập nhật thành công thông tin trận ${match.homeTeam} vs ${match.awayTeam}`, "success");
  }

  saveState();
  updateUI();
  document.getElementById("editMatchModalOverlay").classList.remove("active");
}

// ----------------------------------------------------
// 13. KHỞI TẠO BỘ LẮNG NGHE SỰ KIỆN (EVENT LISTENERS)
// ----------------------------------------------------
function initAllEventListeners() {
  // === A. XỬ LÝ ĐĂNG NHẬP / ĐĂNG XUẤT ===
  document.getElementById("btnLoginSubmit").addEventListener('click', () => {
    const username = document.getElementById("loginUsername").value;
    const passwordInput = document.getElementById("loginPassword").value;
    const errorMsg = document.getElementById("loginErrorMessage");

    const user = state.users[username];
    if (user && user.password === passwordInput) {
      state.currentUser = username;
      saveState();
      
      // Ẩn Overlay Login
      document.getElementById("loginOverlay").style.display = 'none';
      errorMsg.style.display = 'none';
      document.getElementById("loginPassword").value = ""; // clear input
      
      updateUI();
      showToast(`🔑 Đăng nhập thành công! Chào mừng ${user.username}`, "success");
    } else {
      errorMsg.style.display = 'block';
      errorMsg.textContent = "Mật khẩu không chính xác! (Mặc định: 123)";
    }
  });

  document.getElementById("btnLogoutBtn").addEventListener('click', () => {
    state.currentUser = null;
    saveState();
    
    // Hiển thị lại Overlay Login
    document.getElementById("loginOverlay").style.display = 'flex';
    document.getElementById("loginErrorMessage").style.display = 'none';
    
    updateUI();
    showToast("🚪 Đã đăng xuất khỏi tài khoản.", "info");
  });

  // B. Giả lập / Simulator Actions
  document.getElementById("btnSimSyncNow").addEventListener('click', () => {
    syncRealOddsFromApi();
  });

  document.getElementById("btnSimTimeJump").addEventListener('click', () => {
    tickSimulatedClock(5); // Tua nhanh 5 phút
    showToast("⏱️ Đã tua nhanh thời gian giả lập thêm +5 phút!", "info");
  });

  document.getElementById("btnSimRandomGoal").addEventListener('click', () => {
    const liveMatches = state.matches.filter(m => m.status === 'live');
    if (liveMatches.length === 0) {
      showToast("⚠️ Hiện tại không có trận đấu nào đang Live để ghi bàn!", "warning");
      return;
    }
    // Chọn ngẫu nhiên 1 trận live và ghi bàn
    const randMatch = liveMatches[Math.floor(Math.random() * liveMatches.length)];
    const scoreSide = Math.random() > 0.5 ? 'home' : 'away';
    
    if (scoreSide === 'home') randMatch.homeScore++;
    else randMatch.awayScore++;

    triggerGoalNotification(randMatch, scoreSide);
    saveState();
    updateUI();
  });

  document.getElementById("btnResetData").addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn reset toàn bộ cơ sở dữ liệu về mặc định ban đầu?")) {
      resetToDefault();
      updateUI();
    }
  });

  // C. Bộ lọc Tab Match Center
  const filterBtns = document.querySelectorAll('.filter-tab');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMatchCenterCards();
    });
  });

  // D. Notification Bell dropdown
  const bell = document.getElementById("notifBellBtn");
  const notifDropdown = document.getElementById("notifDropdown");
  
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    notifDropdown.classList.remove('active');
  });

  notifDropdown.addEventListener('click', (e) => {
    e.stopPropagation(); // ngăn tắt dropdown khi tương tác bên trong
  });

  document.getElementById("btnMarkAllRead").addEventListener('click', () => {
    const currentUser = state.users[state.currentUser];
    state.notifications.forEach(n => {
      if (n.userId === currentUser.id) n.read = true;
    });
    saveState();
    updateUI();
    showToast("✓ Đã đánh dấu đọc tất cả thông báo.", "info");
  });

  // E. Room Modals trigger
  document.getElementById("btnOpenCreateRoomModal").addEventListener('click', () => {
    document.getElementById("createRoomModalOverlay").classList.add("active");
  });
  document.getElementById("btnCloseCreateRoomModal").addEventListener('click', () => {
    document.getElementById("createRoomModalOverlay").classList.remove("active");
  });

  document.getElementById("btnOpenJoinRoomModal").addEventListener('click', () => {
    document.getElementById("joinRoomModalOverlay").classList.add("active");
  });
  document.getElementById("btnCloseJoinRoomModal").addEventListener('click', () => {
    document.getElementById("joinRoomModalOverlay").classList.remove("active");
  });

  // Room Submit Handlers
  document.getElementById("btnCreateRoomSubmit").addEventListener('click', () => {
    const name = document.getElementById("inputRoomName").value;
    const approval = document.getElementById("checkApprovalRequired").checked;
    createCustomRoom(name, approval);
  });

  document.getElementById("btnJoinRoomSubmit").addEventListener('click', () => {
    const code = document.getElementById("inputRoomCode").value;
    requestJoinCustomRoom(code);
  });

  // F. Bet Modal Selectors & Form inputs
  document.getElementById("btnCloseBetModal").addEventListener('click', () => {
    document.getElementById("betModalOverlay").classList.remove("active");
  });

  const btnSideUpper = document.getElementById("btnBetSideUpper");
  const btnSideLower = document.getElementById("btnBetSideLower");

  btnSideUpper.addEventListener('click', () => {
    selectedBetSide = 'upper';
    btnSideUpper.classList.add("selected");
    btnSideLower.classList.remove("selected");
    updateBetSummary();
  });

  btnSideLower.addEventListener('click', () => {
    selectedBetSide = 'lower';
    btnSideLower.classList.add("selected");
    btnSideUpper.classList.remove("selected");
    updateBetSummary();
  });

  document.getElementById("inputBetAmount").addEventListener('input', () => {
    updateBetSummary();
  });

  document.getElementById("btnBetAllIn").addEventListener('click', () => {
    const currentUser = state.users[state.currentUser];
    document.getElementById("inputBetAmount").value = currentUser.balance;
    updateBetSummary();
  });

  document.getElementById("btnSubmitBet").addEventListener('click', () => {
    processBetSubmit();
  });

  // G. Admin settings form
  document.getElementById("btnSaveAdminSettings").addEventListener('click', () => {
    const fee = parseInt(document.getElementById("inputPlatformFee").value) || 0;
    const apiKey = document.getElementById("inputOddsApiKey").value.trim();
    const sport = document.getElementById("selectOddsApiSport").value;

    state.config.platformFee = Math.max(0, Math.min(50, fee));
    state.config.apiKey = apiKey;
    state.config.oddsApiSport = sport;

    saveState();
    updateUI();
    showToast("💾 Đã lưu các thiết lập cấu hình của Admin!", "success");
  });

  // Admin Manual Deposit (Nạp tiền ví)
  document.getElementById("btnSubmitDeposit").addEventListener('click', () => {
    const userId = document.getElementById("selectDepositUser").value;
    const amount = parseInt(document.getElementById("inputDepositAmount").value) || 0;
    const desc = document.getElementById("inputDepositDesc").value.trim();

    if (amount <= 0) {
      showToast("❌ Số xu nạp phải lớn hơn 0!", "error");
      return;
    }

    const success = executeDeposit(userId, amount, desc);
    if (success) {
      document.getElementById("inputDepositAmount").value = "";
    }
  });

  // Admin Edit Match Modal close & submit
  document.getElementById("btnCloseEditMatchModal").addEventListener('click', () => {
    document.getElementById("editMatchModalOverlay").classList.remove("active");
  });
  document.getElementById("btnSubmitEditMatch").addEventListener('click', () => {
    processEditMatchSubmit();
  });

  // Admin Create manual Match
  document.getElementById("btnCreateManualMatch").addEventListener('click', () => {
    const home = document.getElementById("inputNewHomeTeam").value.trim();
    const away = document.getElementById("inputNewAwayTeam").value.trim();
    const stadium = document.getElementById("inputNewStadium").value.trim() || "Sân vận động Quốc tế";
    const timeVal = document.getElementById("inputNewMatchTime").value;
    const handicapTeam = document.getElementById("selectNewHandicapTeam").value;
    const handicapVal = parseFloat(document.getElementById("selectNewHandicapVal").value);
    const oddsUpper = parseFloat(document.getElementById("inputNewOddsUpper").value) || 0.95;
    const oddsLower = parseFloat(document.getElementById("inputNewOddsLower").value) || 0.85;

    if (!home || !away || !timeVal) {
      showToast("❌ Vui lòng nhập đầy đủ Đội nhà, Đội khách và Thời gian thi đấu!", "error");
      return;
    }

    const matchId = "manual_" + Date.now();
    state.matches.push({
      id: matchId,
      homeTeam: home,
      awayTeam: away,
      stadium: stadium,
      dateStr: new Date(timeVal).toISOString(),
      status: "upcoming",
      homeScore: 0,
      awayScore: 0,
      handicap: {
        upperTeamId: handicapTeam,
        value: handicapVal,
        oddsUpper: oddsUpper,
        oddsLower: oddsLower
      },
      timeElapsed: 0
    });

    saveState();
    updateUI();
    showToast(`🏟️ Đã tạo thành công trận đấu ${home} vs ${away}!`, "success");

    // Reset Form
    document.getElementById("inputNewHomeTeam").value = "";
    document.getElementById("inputNewAwayTeam").value = "";
    document.getElementById("inputNewStadium").value = "";
    document.getElementById("inputNewMatchTime").value = "";
  });
}

// ----------------------------------------------------
// 14. RUN LOOPS (TỰ ĐỘNG CHẠY TIẾN TRÌNH NGẦM 5 PHÚT)
// ----------------------------------------------------
function startAutomatedCron() {
  // Tự động chạy tickSimulatedClock mỗi 30 giây thực tế = 5 phút game
  setInterval(() => {
    if (state.currentUser) {
      tickSimulatedClock(5);
    }
  }, 30000);
}

// Khởi chạy ứng dụng khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  initLocalStorageState();
  setupTabNavigation();
  initAllEventListeners();
  
  // === BẮT ĐẦU CHECK AUTHENTICATION ===
  if (!state.currentUser) {
    document.getElementById("loginOverlay").style.display = 'flex';
  } else {
    document.getElementById("loginOverlay").style.display = 'none';
  }

  updateUI();
  startAutomatedCron();

  // Chạy đồng bộ tự động trận đấu lần đầu
  if (state.currentUser) {
    runMatchAutomationSync();
  }
});


