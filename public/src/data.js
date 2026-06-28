export const publicSources = [
  {
    title: "Only 0.35% kabaza operators registered",
    publisher: "The Times Group",
    url: "https://times.mw/0-35-kabaza-operators-registered/",
    fact: "The article reports 2,578,909 motorcycles and 7,912 registered with MACOKASA."
  },
  {
    title: "MACOKASA in kabaza awareness campaign",
    publisher: "Malawi News Agency",
    url: "https://manaonline.gov.mw/index.php?Itemid=412&id=6065%3Amacokasa-in-kabaza-awareness-campaign&option=com_k2&view=item",
    fact: "MACOKASA has conducted road safety awareness on helmets, reflectors, safety shoes, one passenger, and training engagement."
  },
  {
    title: "Fresh drive to tame Kabaza",
    publisher: "Nation Online",
    url: "https://mwnation.com/fresh-drive-to-tame-kabaza/",
    fact: "MACOKASA and Malawi Police Service teamed up to bring sanity among kabaza operators and enforce safety compliance."
  },
  {
    title: "Despite many accidents, Malawians still prefer Kabaza",
    publisher: "Nyasa Times",
    url: "https://www.nyasatimes.com/despite-many-accidents-malawians-still-prefer-kabaza/",
    fact: "MACOKASA leadership has advocated for regulation, lower licence fees, and helmet use."
  }
];

export const districts = [
  "Balaka", "Blantyre", "Chikwawa", "Chiradzulu", "Chitipa", "Dedza", "Dowa", "Karonga",
  "Kasungu", "Likoma", "Lilongwe", "Machinga", "Mangochi", "Mchinji", "Mulanje", "Mwanza",
  "Mzimba", "Neno", "Nkhata Bay", "Nkhotakota", "Nsanje", "Ntcheu", "Ntchisi", "Phalombe",
  "Rumphi", "Salima", "Thyolo", "Zomba"
];

export const membershipPlans = [
  {
    key: "regular",
    name: "Regular",
    audience: "Operator",
    annualFee: 15000,
    color: "#10b91f",
    benefits: ["National membership record", "Renewal reminders", "Public QR verification", "ROSAF training discount eligibility"]
  },
  {
    key: "silver",
    name: "Silver",
    audience: "Operator",
    annualFee: 30000,
    color: "#b8c0cc",
    benefits: ["All Regular benefits", "Priority ID card queue", "Safety compliance badge", "Owner matching visibility"]
  },
  {
    key: "gold",
    name: "Gold",
    audience: "Operator",
    annualFee: 55000,
    color: "#f4c400",
    benefits: ["All Silver benefits", "Reduced refresher training fees", "Rank promotion as safer operator", "Complaints resolution support"]
  },
  {
    key: "platinum",
    name: "Platinum",
    audience: "Operator",
    annualFee: 90000,
    color: "#e5e4e2",
    benefits: ["All Gold benefits", "Tracker installation eligibility", "Fleet-owner priority matching", "Premium digital profile"]
  },
  {
    key: "owner_basic",
    name: "Owner Basic",
    audience: "Motorcycle Owner",
    annualFee: 45000,
    color: "#0075bd",
    benefits: ["Owner portal", "Motorcycle mapping", "Operator agreement records", "Basic earnings and expense tracking"]
  },
  {
    key: "owner_fleet",
    name: "Owner Fleet",
    audience: "Motorcycle Owner",
    annualFee: 120000,
    color: "#111827",
    benefits: ["All Owner Basic benefits", "Multi-bike fund dashboard", "Operator behavior notifications", "Complaints feedback workflow"]
  }
];

export const paymentMethods = ["AirtelMoney", "Mpamba", "Bank Card", "Bank Transfer", "Cash"];
export const reminderDays = [28, 14, 7, 3, 2, 1];

export const affiliatedMembers = ["ROSAF", "KATAMAS", "KAMA"];
export const stakeholders = ["DRTSS", "MPS", "Local government", "Ministry of Transport"];

export const demoState = {
  impact: {
    estimatedFleet: 2800000,
    reportedMotorcycles: 2578909,
    registeredOperators: 7912,
    registeredMotorcycles: 6840,
    subscribedOwners: 1265,
    targetRegistrationShare: 70,
    districtsReached: 7,
    trainingPartners: ["ROSAF", "Lilongwe City Council", "Malawi Police Service", "City councils", "Printing partners"]
  },
  operators: [
    {
      id: "op-001",
      membershipNumber: "MCK-LL-2026-0001",
      fullName: "Joseph Banda",
      phone: "+265 991 230 111",
      email: "joseph.banda@example.com",
      nationalId: "MW-LL-000001",
      operatorCategory: "Motorcycle operator",
      sex: "Male",
      district: "Lilongwe",
      operatingArea: "Area 25 Rank",
      membershipPlan: "gold",
      membershipType: "operator",
      expiresOn: "2026-07-22",
      hasLicense: true,
      licenseNumber: "DL-LL-42101",
      ownershipStatus: "Rents motorcycle",
      motorcycleId: "bike-001",
      helmetUse: true,
      passengerHelmet: true,
      licensePlate: "LL 8421",
      trackerInstalled: false,
      status: "active",
      photoData: "",
      createdAt: "2026-01-11"
    },
    {
      id: "op-002",
      membershipNumber: "MCK-BT-2026-0002",
      fullName: "Madalitso Jere",
      phone: "+265 888 450 222",
      email: "madalitso.jere@example.com",
      nationalId: "MW-BT-000002",
      operatorCategory: "Bicycle operator",
      sex: "Female",
      district: "Blantyre",
      operatingArea: "Clock Tower",
      membershipPlan: "regular",
      membershipType: "operator",
      expiresOn: "2026-07-08",
      hasLicense: false,
      licenseNumber: "",
      ownershipStatus: "Owns motorcycle",
      motorcycleId: "bike-002",
      helmetUse: true,
      passengerHelmet: false,
      licensePlate: "BT 3402",
      trackerInstalled: false,
      status: "training due",
      photoData: "",
      createdAt: "2026-02-03"
    },
    {
      id: "op-003",
      membershipNumber: "MCK-MZ-2026-0003",
      fullName: "Allan Faison",
      phone: "+265 999 120 887",
      email: "allan.faison@example.com",
      nationalId: "MW-MZ-000003",
      operatorCategory: "Motorcycle operator",
      sex: "Male",
      district: "Mzuzu",
      operatingArea: "Mzuzu Depot",
      membershipPlan: "platinum",
      membershipType: "operator",
      expiresOn: "2026-11-18",
      hasLicense: true,
      licenseNumber: "DL-MZ-91233",
      ownershipStatus: "Rents motorcycle",
      motorcycleId: "bike-003",
      helmetUse: true,
      passengerHelmet: true,
      licensePlate: "MZ 7728",
      trackerInstalled: true,
      status: "active",
      photoData: "",
      createdAt: "2026-02-19"
    }
  ],
  owners: [
    {
      id: "owner-001",
      ownerNumber: "OWN-LL-0001",
      fullName: "Grace Phiri",
      phone: "+265 997 800 123",
      email: "grace.phiri@example.com",
      district: "Lilongwe",
      plan: "owner_fleet",
      expiresOn: "2027-01-30",
      status: "active"
    },
    {
      id: "owner-002",
      ownerNumber: "OWN-BT-0002",
      fullName: "Frank Staford",
      phone: "+265 884 610 912",
      email: "frank.staford@example.com",
      district: "Blantyre",
      plan: "owner_basic",
      expiresOn: "2026-08-30",
      status: "active"
    }
  ],
  motorcycles: [
    {
      id: "bike-001",
      ownerId: "owner-001",
      plateNumber: "LL 8421",
      make: "Bajaj Boxer",
      trackerEligible: true,
      trackerInstalled: false,
      helmetCount: 2,
      assignedOperatorId: "op-001",
      agreementType: "Target based",
      monthlyTarget: 180000,
      monthlyPay: 0
    },
    {
      id: "bike-002",
      ownerId: "owner-002",
      plateNumber: "BT 3402",
      make: "TVS HLX",
      trackerEligible: false,
      trackerInstalled: false,
      helmetCount: 1,
      assignedOperatorId: "op-002",
      agreementType: "Monthly pay",
      monthlyTarget: 0,
      monthlyPay: 120000
    },
    {
      id: "bike-003",
      ownerId: "owner-001",
      plateNumber: "MZ 7728",
      make: "Honda ACE",
      trackerEligible: true,
      trackerInstalled: true,
      helmetCount: 2,
      assignedOperatorId: "op-003",
      agreementType: "Target based",
      monthlyTarget: 220000,
      monthlyPay: 0
    }
  ],
  payments: [
    {
      id: "pay-001",
      payerName: "Joseph Banda",
      payerType: "operator",
      membershipNumber: "MCK-LL-2026-0001",
      method: "AirtelMoney",
      amount: 55000,
      purpose: "Gold annual subscription",
      collectorName: "",
      reference: "AM-884201",
      status: "reconciled",
      createdAt: "2026-01-11"
    },
    {
      id: "pay-002",
      payerName: "Madalitso Jere",
      payerType: "operator",
      membershipNumber: "MCK-BT-2026-0002",
      method: "Cash",
      amount: 15000,
      purpose: "Regular annual subscription",
      collectorName: "MACOKASA Blantyre Treasurer",
      reference: "CASH-BT-011",
      status: "awaiting deposit",
      createdAt: "2026-02-03"
    }
  ],
  cards: [
    {
      id: "card-001",
      operatorId: "op-001",
      cardNumber: "CARD-MCK-0001",
      qrToken: "qr-op-001-20260111",
      status: "active",
      membershipPlan: "gold",
      issuedAt: "2026-01-12",
      replacedBy: ""
    },
    {
      id: "card-002",
      operatorId: "op-002",
      cardNumber: "CARD-MCK-0002",
      qrToken: "qr-op-002-20260203",
      status: "active",
      membershipPlan: "regular",
      issuedAt: "2026-02-05",
      replacedBy: ""
    }
  ],
  cooperatives: [
    {
      id: "coop-001",
      name: "Lilongwe Safer Riders Cooperative",
      district: "Lilongwe",
      members: 34,
      requestedMotorcycles: 12,
      loanAmount: 18500000,
      guarantorStatus: "MACOKASA review",
      bankPartner: "Pending partner bank"
    }
  ],
  fundEntries: [
    {
      id: "fund-001",
      ownerId: "owner-001",
      motorcycleId: "bike-001",
      type: "income",
      amount: 45000,
      note: "Week 1 target collection",
      createdAt: "2026-06-03"
    },
    {
      id: "fund-002",
      ownerId: "owner-001",
      motorcycleId: "bike-001",
      type: "expense",
      amount: 12000,
      note: "Service and chain replacement",
      createdAt: "2026-06-06"
    },
    {
      id: "fund-003",
      ownerId: "owner-002",
      motorcycleId: "bike-002",
      type: "income",
      amount: 120000,
      note: "Monthly operator payment",
      createdAt: "2026-06-01"
    }
  ],
  donations: [
    {
      id: "don-001",
      donorName: "Road Safety Supporter",
      amount: 250000,
      method: "Bank Transfer",
      purpose: "Helmet safety campaign",
      createdAt: "2026-05-18"
    }
  ],
  financeEntries: [
    {
      id: "fin-003",
      type: "expense",
      category: "Training support",
      source: "ROSAF safe riding course",
      amount: 120000,
      method: "Bank Transfer",
      reference: "EXP-TRN-001",
      recordedBy: "Finance Officer",
      notes: "Operator refresher training support",
      createdAt: "2026-06-05"
    },
    {
      id: "fin-004",
      type: "expense",
      category: "Card printing",
      source: "ID card production",
      amount: 45000,
      method: "Cash",
      reference: "EXP-CARD-001",
      recordedBy: "Printing Desk",
      notes: "Initial PVC card batch",
      createdAt: "2026-06-10"
    }
  ],
  stories: [
    {
      id: "story-001",
      title: "Kabaza operators complete road safety practice",
      category: "Training",
      summary: "Operators practice controlled riding, cone navigation, helmet discipline, and road positioning during a stakeholder safety session.",
      body: "MACOKASA uses road safety activities to connect operators, trainers, police, owners, and local leadership around safer public transport. The story demonstrates how verified membership can become a pathway to responsible riding and public confidence.",
      images: ["./assets/macokasa-road-safety-training.jpg", "./assets/macokasa-rider-training.jpg"],
      imageData: "./assets/macokasa-road-safety-training.jpg",
      status: "published",
      createdAt: "2026-06-20"
    },
    {
      id: "story-002",
      title: "Stakeholders support safer Kabaza formalization",
      category: "Stakeholder meeting",
      summary: "Training partners and public safety stakeholders engage riders on licensing, protective gear, passenger safety, and rank accountability.",
      body: "The MACOKASA IMS gives this work a practical home by linking registration, licence support, motorcycle ownership, complaints, card verification, and district-level reporting.",
      images: ["./assets/macokasa-rider-training.jpg", "./assets/macokasa-road-safety-training.jpg"],
      imageData: "./assets/macokasa-rider-training.jpg",
      status: "published",
      createdAt: "2026-06-18"
    }
  ],
  reminderLogs: []
};
