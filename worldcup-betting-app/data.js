// Mật khẩu mặc định cho tất cả các tài khoản demo là "123456"
// Admin có thể truy cập toàn bộ chức năng
// Player chỉ được truy cập các tab cược, ví, phòng chơi.
const INITIAL_DATA = {
  // Cấu hình hệ thống
  config: {
    platformFee: 5, // % phí hoa hồng sàn (ví dụ 5%)
    apiKey: "", // API Key cho The Odds API
    oddsApiSport: "soccer_uefa_champs_league", // Giải đấu đồng bộ mặc định
    lastSyncTime: null,
    systemWalletBalance: 0, // Số xu trong ví nhà cái thu từ phí sàn & cược thua
    googleClientId: "578999621106-q6m71v80hf3imftoer6t8c6snsoo5u9f.apps.googleusercontent.com" // Mẫu Client ID (người dùng thay đổi được)
  },
  
  // Trạng thái phiên đăng nhập giả lập
  currentUser: null, // Đổi mặc định thành null để bắt đăng nhập khi vào app

  // Danh sách tài khoản người dùng trong hệ thống
  users: {
    "dinhminhhieu28_gmail_com": {
      id: "dinhminhhieu28_gmail_com",
      username: "Hieu Dinh (Admin)",
      email: "dinhminhhieu28@gmail.com",
      role: "admin",
      balance: 100000,
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=admin"
    },
    "ngsduc2000_gmail_com": {
      id: "ngsduc2000_gmail_com",
      username: "Duc Nguyen (Admin)",
      email: "ngsduc2000@gmail.com",
      role: "admin",
      balance: 100000,
      avatar: "https://api.dicebear.com/7.x/duc/svg?seed=duc"
    },
    "messi": {
      id: "messi",
      username: "Lionel Messi",
      email: "messi@gmail.com",
      role: "player",
      balance: 1500,
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=messi"
    },
    "ronaldo": {
      id: "ronaldo",
      username: "Cristiano Ronaldo",
      email: "ronaldo@gmail.com",
      role: "player",
      balance: 1200,
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=ronaldo"
    },
    "neymar": {
      id: "neymar",
      username: "Neymar Jr",
      email: "neymar@gmail.com",
      role: "player",
      balance: 800,
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=neymar"
    }
  },

  // Danh sách các trận đấu
  matches: [
    {
      id: "match_1",
      homeTeam: "Qatar",
      awayTeam: "Ecuador",
      stadium: "Al Bayt Stadium",
      dateStr: "2026-06-10T22:00:00+07:00",
      status: "upcoming", // upcoming, live, finished
      homeScore: 0,
      awayScore: 0,
      // Kèo chấp: Đội cửa trên chấp đội cửa dưới bao nhiêu trái
      handicap: {
        upperTeamId: "away", // 'home' hoặc 'away'. Ở đây Ecuador (away) chấp Qatar (home)
        value: 0.5, // Chấp lẻ bán trái (0.5, 1.5, 2.5...) loại bỏ hoàn toàn kịch bản hòa cược
        oddsUpper: 0.95, // Tỷ lệ ăn của cửa trên
        oddsLower: 0.85  // Tỷ lệ ăn của cửa dưới
      },
      timeElapsed: 0 // Số phút thi đấu (giả lập)
    },
    {
      id: "match_2",
      homeTeam: "England",
      awayTeam: "Iran",
      stadium: "Khalifa International Stadium",
      dateStr: "2026-06-11T19:00:00+07:00",
      status: "upcoming",
      homeScore: 0,
      awayScore: 0,
      handicap: {
        upperTeamId: "home", // England chấp Iran
        value: 1.5,
        oddsUpper: 0.90,
        oddsLower: 0.92
      },
      timeElapsed: 0
    },
    {
      id: "match_3",
      homeTeam: "Senegal",
      awayTeam: "Netherlands",
      stadium: "Al Thumama Stadium",
      dateStr: "2026-06-12T01:00:00+07:00",
      status: "upcoming",
      homeScore: 0,
      awayScore: 0,
      handicap: {
        upperTeamId: "away", // Netherlands chấp Senegal
        value: 0.5,
        oddsUpper: 0.88,
        oddsLower: 0.98
      },
      timeElapsed: 0
    },
    {
      id: "match_4",
      homeTeam: "USA",
      awayTeam: "Wales",
      stadium: "Ahmad Bin Ali Stadium",
      dateStr: "2026-06-08T11:55:00+07:00", // Gần giờ bóng lăn
      status: "upcoming",
      homeScore: 0,
      awayScore: 0,
      handicap: {
        upperTeamId: "home", // USA chấp Wales
        value: 0.5,
        oddsUpper: 0.95,
        oddsLower: 0.85
      },
      timeElapsed: 0
    },
    {
      id: "match_5",
      homeTeam: "Argentina",
      awayTeam: "Saudi Arabia",
      stadium: "Lusail Stadium",
      dateStr: "2026-06-07T18:00:00+07:00",
      status: "finished",
      homeScore: 1,
      awayScore: 2,
      handicap: {
        upperTeamId: "home", // Argentina chấp Saudi Arabia 1.5 trái
        value: 1.5,
        oddsUpper: 0.85,
        oddsLower: 0.98
      },
      timeElapsed: 90
    },
    {
      id: "match_6",
      homeTeam: "France",
      awayTeam: "Australia",
      stadium: "Al Janoub Stadium",
      dateStr: "2026-06-12T22:00:00+07:00",
      status: "upcoming",
      homeScore: 0,
      awayScore: 0,
      handicap: {
        upperTeamId: "home", // France chấp Australia 1.5 trái
        value: 1.5,
        oddsUpper: 0.92,
        oddsLower: 0.88
      },
      timeElapsed: 0
    }
  ],

  // Các cược đã đặt
  bets: [
    {
      id: "bet_pre_1",
      matchId: "match_5",
      userId: "ronaldo",
      betSide: "upper", // Đặt Argentina (cửa trên)
      amount: 200,
      status: "lost", // Trận đã kết thúc, Argentina thua kèo (1 - 1.5 < 2)
      payout: 0,
      feeDeducted: 0,
      timestamp: "2026-06-07T17:30:00+07:00"
    },
    {
      id: "bet_pre_2",
      matchId: "match_5",
      userId: "neymar",
      betSide: "lower", // Đặt Saudi Arabia (cửa dưới)
      amount: 100,
      status: "won", // Thắng cược! Nhận lại gốc 100 + thắng 100*0.98 = 98 xu (trừ 5% fee còn 93.1)
      payout: 193.1, 
      feeDeducted: 4.9,
      timestamp: "2026-06-07T17:45:00+07:00"
    }
  ],

  // Quản lý phòng chơi
  rooms: {
    "GLOBAL": {
      id: "GLOBAL",
      name: "Phòng Nội Bộ Tổng",
      code: "GLOBAL",
      ownerId: "admin",
      approvalRequired: false,
      members: ["messi", "ronaldo", "neymar"],
      pendingRequests: [],
      type: "internal"
    },
    "GOAT69": {
      id: "GOAT69",
      name: "Câu Lạc Bộ GOATs",
      code: "GOAT69",
      ownerId: "messi",
      approvalRequired: true,
      members: ["messi", "ronaldo"],
      pendingRequests: ["neymar"],
      type: "custom"
    }
  },

  // Hệ thống thông báo
  notifications: [
    {
      id: "notif_1",
      userId: "neymar",
      title: "🎉 Nhận thưởng thắng cược",
      message: "Bạn đã dự đoán chính xác trận Argentina vs Saudi Arabia và nhận được +93.1 xu (đã khấu trừ 5% phí sàn).",
      type: "success",
      read: false,
      timestamp: "2026-06-07T19:55:00+07:00"
    },
    {
      id: "notif_2",
      userId: "ronaldo",
      title: "❌ Chia buồn kết quả cược",
      message: "Bạn đã đoán sai trận Argentina vs Saudi Arabia và bị trừ -200 xu cược.",
      type: "error",
      read: true,
      timestamp: "2026-06-07T19:55:00+07:00"
    }
  ],

  // Lịch sử giao dịch ví (để hiển thị bảng Sao kê)
  transactions: [
    {
      id: "tx_1",
      userId: "messi",
      amount: 1500,
      type: "deposit", // deposit, bet_freeze, bet_refund, win_payout, commission
      description: "Khởi tạo tài khoản (Admin nạp tiền)",
      timestamp: "2026-06-07T12:00:00+07:00"
    },
    {
      id: "tx_2",
      userId: "ronaldo",
      amount: 1200,
      type: "deposit",
      description: "Khởi tạo tài khoản (Admin nạp tiền)",
      timestamp: "2026-06-07T12:00:00+07:00"
    },
    {
      id: "tx_3",
      userId: "neymar",
      amount: 800,
      type: "deposit",
      description: "Khởi tạo tài khoản (Admin nạp tiền)",
      timestamp: "2026-06-07T12:00:00+07:00"
    },
    {
      id: "tx_4",
      userId: "ronaldo",
      amount: -200,
      type: "bet_freeze",
      description: "Đóng băng tiền đặt cược trận Argentina vs Saudi Arabia",
      timestamp: "2026-06-07T17:30:00+07:00"
    },
    {
      id: "tx_5",
      userId: "neymar",
      amount: -100,
      type: "bet_freeze",
      description: "Đóng băng tiền đặt cược trận Argentina vs Saudi Arabia",
      timestamp: "2026-06-07T17:45:00+07:00"
    },
    {
      id: "tx_6",
      userId: "neymar",
      amount: 193.1,
      type: "win_payout",
      description: "Thanh toán thắng cược trận Argentina vs Saudi Arabia (Sau phí)",
      timestamp: "2026-06-07T19:55:00+07:00"
    }
  ]
};
