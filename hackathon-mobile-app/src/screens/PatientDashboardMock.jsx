import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { scheduleAncReminders, requestNotificationPermission } from "../services/NotificationService";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import {
  doctorNearby,
  patientMe,
  patientAshaList,
  patientAssignAshaWorker,
} from "../services/api";
import {
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { assess, buildPatientInputsFromProfile } from "../services/ruleEngine";
import { normalizeAncInputs, riskTone, statusLabel } from "../services/ancAssessment";

const quickActions = [
  { title: "Chat with Mauli", icon: "message-square", color: "#5DC1B9", route: "Chat" },
  { title: "Health Records", icon: "file-text", color: "#F97316", route: "HealthRecords" },
  { title: "My Calendar", icon: "calendar", color: "#6366F1", route: "Calendar" },
  { title: "Call with Ai", icon: "mic", color: "#EC4899", route: "VapiCall" },
];

const bottomNavItems = [
  { label: "Home", icon: "home" },
  { label: "Chat", icon: "message-circle", route: "Chat" },
  { label: "Records", icon: "file-text", route: "HealthRecords" },
  { label: "Profile", icon: "user", route: "PatientProfile" },
];

function badgeStyles(tone) {
  if (tone === "high") {
    return { wrap: { backgroundColor: "#FEE2E2" }, text: { color: "#DC2626" } };
  }
  if (tone === "medium") {
    return { wrap: { backgroundColor: "#FEF3C7" }, text: { color: "#B45309" } };
  }
  return { wrap: { backgroundColor: "#DCFCE7" }, text: { color: "#15803D" } };
}

function storedRiskTone(riskLevel) {
  if (riskLevel === "CRITICAL" || riskLevel === "EMERGENCY" || riskLevel === "HIGH") return "high";
  if (riskLevel === "MEDIUM") return "medium";
  return "low";
}

function storedStatusLabel(riskLevel) {
  if (riskLevel === "CRITICAL" || riskLevel === "EMERGENCY") return "Emergency referral";
  if (riskLevel === "HIGH") return "High risk";
  if (riskLevel === "MEDIUM") return "Medium risk watch";
  return "Low risk";
}

function isStoredHighRisk(riskLevel) {
  return riskLevel === "CRITICAL" || riskLevel === "EMERGENCY" || riskLevel === "HIGH";
}

function formatStoredReferral(referral) {
  const urgency = referral?.urgency;
  if (urgency === "IMMEDIATE") return "Immediate";
  if (urgency === "WITHIN_24_HOURS") return "Within 24h";
  if (urgency === "ROUTINE") return "Routine";
  return null;
}

export default function PatientDashboardMock() {
  const navigation = useNavigation();
  const { user, token, signOut } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ashaModalOpen, setAshaModalOpen] = useState(false);
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [ashaWorkers, setAshaWorkers] = useState([]);
  const [ashaLoading, setAshaLoading] = useState(false);
  const [ashaError, setAshaError] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedAsha, setSelectedAsha] = useState(null);
  const [ancInputs, setAncInputs] = useState(null);
  const [ancDirty, setAncDirty] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  async function loadProfile() {
    if (!token) return;
    try {
      const data = await patientMe(token);
      setProfile(data || null);
      setAncDirty(false);
    } catch (error) {
      setProfile(null);
    }
  }

  useEffect(() => {
    loadProfile();
  }, [token]);

  useFocusEffect(
    React.useCallback(() => {
      loadProfile();
    }, [token])
  );

  const activeUser = profile || user;

  useEffect(() => {
    if (!ancDirty) {
      setAncInputs(buildPatientInputsFromProfile(activeUser || {}));
    }
  }, [activeUser, ancDirty]);

  useEffect(() => {
    const loadDoctors = async () => {
      if (!activeUser?.locationCoordinates) return;
      try {
        const data = await doctorNearby(
          activeUser.locationCoordinates.latitude,
          activeUser.locationCoordinates.longitude,
          10
        );
        setDoctors(data.results || []);
      } catch (error) {
        setDoctors([]);
      }
    };
    loadDoctors();
  }, [activeUser]);

  useEffect(() => {
    let animation;
    if (searching) {
      pulse.setValue(0);
      animation = Animated.loop(
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        })
      );
      animation.start();
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [searching, pulse]);

  const normalizedAncInputs = useMemo(() => normalizeAncInputs(ancInputs || {}), [ancInputs]);
  const dashboardAssessment = useMemo(() => assess(normalizedAncInputs), [normalizedAncInputs]);
  const currentRiskTone = riskTone(dashboardAssessment.riskBand);
  const latestSavedVisit = useMemo(() => {
    const visits = Array.isArray(activeUser?._visits) ? [...activeUser._visits] : [];
    return visits
      .filter((visit) => visit?.assessment)
      .sort((a, b) => new Date(b?.visitDate || 0).getTime() - new Date(a?.visitDate || 0).getTime())[0] || null;
  }, [activeUser]);
  const latestSavedAssessment = latestSavedVisit?.assessment || null;
  const dashboardTone = latestSavedAssessment ? storedRiskTone(latestSavedAssessment.riskLevel) : currentRiskTone;
  const currentBadge = badgeStyles(dashboardTone);
  const dashboardStatusText = latestSavedAssessment
    ? storedStatusLabel(latestSavedAssessment.riskLevel)
    : statusLabel(dashboardAssessment);
  const dashboardScore = latestSavedAssessment?.score ?? dashboardAssessment.score;
  const dashboardReasons = latestSavedAssessment?.reasons?.length
    ? latestSavedAssessment.reasons
    : dashboardAssessment.reasons;
  const dashboardReferral = formatStoredReferral(latestSavedAssessment?.referral) || dashboardAssessment.referralLevel;
  const dashboardDecision = latestSavedAssessment?.referral?.message || dashboardAssessment.decision;
  const dashboardSummary = latestSavedAssessment
    ? "Showing the latest saved ANC assessment from your records so the homepage score matches clinical scoring."
    : "This risk summary is calculated from the patient's saved ANC data and previous records.";

  // ── Schedule ANC notifications whenever profile/assessment updates
  useEffect(() => {
    if (!activeUser || !dashboardAssessment) return;
    const name = activeUser?.abha_profile?.firstName || activeUser?.name?.split(" ")[0] || "Patient";
    scheduleAncReminders(activeUser, dashboardAssessment, name).catch(() => {});
  }, [activeUser, dashboardAssessment]);

  const firstName =
    activeUser?.abha_profile?.firstName ||
    activeUser?.name?.split(" ")[0] ||
    "Friend";

  const gender = activeUser?.abha_profile?.gender || activeUser?.gender || "F";
  const avatarSource =
    gender === "F"
      ? require("../../assets/female-icon.png")
      : require("../../assets/male-icon.png");

  const supportName =
    activeUser?.anmWorker?.name ||
    activeUser?.supportName ||
    activeUser?.ashaWorker?.name ||
    null;

  const isHighRisk =
    dashboardAssessment.riskBand === "HIGH" ||
    dashboardAssessment.riskBand === "EMERGENCY" ||
    isStoredHighRisk(latestSavedAssessment?.riskLevel) ||
    activeUser?.cdssSummary?.latestRiskLevel === "HIGH";

  const handleLogout = () => {
    setMenuOpen(false);
    signOut();
    navigation.reset({ index: 0, routes: [{ name: "RoleSelection" }] });
  };

  const loadAshaWorkers = async () => {
    if (!token) return;
    setAshaLoading(true);
    setAshaError("");
    try {
      const data = await patientAshaList(token);
      setAshaWorkers(data?.results || []);
    } catch (error) {
      setAshaError(error.message || "Unable to load ASHA workers");
    } finally {
      setAshaLoading(false);
    }
  };

  const openAshaModal = async () => {
    setAshaModalOpen(true);
    await loadAshaWorkers();
  };

  const calcDistanceKm = (origin, target) => {
    if (!origin || !target) return null;
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(target.latitude - origin.latitude);
    const dLon = toRad(target.longitude - origin.longitude);
    const lat1 = toRad(origin.latitude);
    const lat2 = toRad(target.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const handleConnectAsha = async (worker) => {
    if (!token || !worker?._id) return;
    setSelectedAsha(worker);
    setSearching(true);
    setAssigning(true);
    setAshaError("");
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const assigned = await patientAssignAshaWorker(token, worker._id);
      setProfile((prev) => ({
        ...(prev || {}),
        supportName: assigned?.ashaWorker?.name || prev?.supportName,
        supportRole: "ASHA Worker",
        ashaWorker: assigned?.ashaWorker || prev?.ashaWorker,
        ashaWorkerAssignedAt: new Date().toISOString(),
      }));
      setAshaModalOpen(false);
    } catch (error) {
      setAshaError(error.message || "Unable to connect ASHA worker");
    } finally {
      setAssigning(false);
      setSearching(false);
    }
  };

  const closeDoctorModal = () => {
    setDoctorModalOpen(false);
    setSelectedDoctor(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingSmall}>Good Morning,</Text>
            <Text style={styles.greeting}>{`Hello, ${firstName}`}</Text>
          </View>
          <View style={styles.avatarMenuWrap}>
            <TouchableOpacity
              style={styles.avatarRing}
              activeOpacity={0.7}
              onPress={() => setMenuOpen((prev) => !prev)}
            >
              <Image source={avatarSource} style={styles.headerAvatar} resizeMode="contain" />
            </TouchableOpacity>
            {menuOpen && (
              <View style={styles.avatarMenu}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate("PatientProfile");
                  }}
                >
                  <Feather name="user" size={16} color="#4B5563" style={{ marginRight: 8 }} />
                  <Text style={styles.menuText}>Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleLogout}>
                  <Feather name="log-out" size={16} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={[styles.menuText, styles.menuTextDanger]}>Logout</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {activeUser?.pregnancyDetails?.currentlyPregnant && (
          <>
            <Pressable
              style={[styles.statusBanner, isHighRisk && styles.statusBannerHigh]}
              onPress={() => navigation.navigate("HealthRecords")}
            >
              <View style={styles.statusContent}>
                <View style={styles.statusIconWrap}>
                  <Feather name="heart" size={24} color={isHighRisk ? "#DC2626" : "#5DC1B9"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>Pregnancy Status</Text>
                  <Text style={styles.statusSubtitle}>
                    Week {normalizedAncInputs.gestationalWeekage || activeUser.pregnancyDetails.gestationalAgeWeeks} · {dashboardStatusText}
                  </Text>
                  <Text style={styles.statusCaption}>
                    {latestSavedAssessment ? `Latest score ${dashboardScore}` : dashboardAssessment.decision} · Next visit {dashboardAssessment.nextVisitWeeks === 0 ? "Now" : `${dashboardAssessment.nextVisitWeeks}w`}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94A3B8" />
              </View>
            </Pressable>

            <View style={styles.predictionCard}>
              <View style={styles.predictionHeader}>
                <View>
                  <Text style={styles.predictionEyebrow}>{latestSavedAssessment ? "Latest Saved ANC Score" : "Home ANC Prediction"}</Text>
                  <Text style={styles.predictionTitle}>{dashboardStatusText}</Text>
                </View>
                <View style={[styles.predictionBadge, currentBadge.wrap]}>
                  <Text style={[styles.predictionBadgeText, currentBadge.text]}>Score {dashboardScore}</Text>
                </View>
              </View>

              <Text style={styles.predictionSummary}>
                {dashboardSummary}
              </Text>

              <View style={styles.predictionMetaRow}>
                <View style={styles.predictionMetaCard}>
                  <Text style={styles.predictionMetaLabel}>Decision</Text>
                  <Text style={styles.predictionMetaValue}>{dashboardDecision}</Text>
                </View>
                <View style={styles.predictionMetaCard}>
                  <Text style={styles.predictionMetaLabel}>Referral</Text>
                  <Text style={styles.predictionMetaValue}>{dashboardReferral}</Text>
                </View>
              </View>

              {dashboardReasons?.length > 0 ? (
                <View style={styles.reasonsWrap}>
                  {dashboardReasons.slice(0, 4).map((reason, index) => (
                    <View key={`${reason}-${index}`} style={styles.reasonRow}>
                      <Feather
                        name={dashboardTone === "high" ? "alert-triangle" : "check-circle"}
                        size={14}
                        color={dashboardTone === "high" ? "#DC2626" : dashboardTone === "medium" ? "#B45309" : "#15803D"}
                      />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.homeActionRow}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate("HealthRecords")}>
                  <Text style={styles.primaryButtonText}>Open Full Records</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(item.route)}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: `${item.color}15` }]}>
                <Feather name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={styles.quickTitle}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Nearby Doctors</Text>
          <TouchableOpacity onPress={() => Alert.alert("Doctors", "See all doctors tapped")}>
            <Text style={styles.sectionLink}>See All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.doctorScroll}>
          {doctors.map((doctor) => (
            <TouchableOpacity
              key={doctor._id}
              style={styles.doctorCard}
              onPress={() => {
                setSelectedDoctor(doctor);
                setDoctorModalOpen(true);
              }}
            >
              <View style={styles.doctorAvatarWrap}>
                <Image source={require("../../assets/male-doctor-icon.png")} style={styles.doctorAvatar} />
              </View>
              <Text style={styles.doctorName} numberOfLines={1}>{doctor.name}</Text>
              <Text style={styles.doctorMeta} numberOfLines={1}>{doctor.hospitalName || "Nearby Clinic"}</Text>
              <View style={styles.doctorDistTag}>
                <Text style={styles.doctorDistText}>{doctor.distanceKm} km</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Local Support</Text>
        <View style={styles.supportCard}>
          <View style={styles.supportIcon}>
            <Image source={require("../../assets/female-icon.png")} style={{ width: 28, height: 28 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.supportName}>{supportName || "Find Support"}</Text>
            <Text style={styles.supportRole}>{supportName ? "ANM Worker" : "Connect with nearby ASHA worker"}</Text>
          </View>
          <TouchableOpacity style={styles.supportAction} onPress={openAshaModal}>
            <Feather name={supportName ? "phone" : "user-plus"} size={18} color="#5DC1B9" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.connectButton} activeOpacity={0.8} onPress={openAshaModal}>
          <Text style={styles.connectButtonText}>
            {supportName ? "Change Support Contact" : "Connect to ASHA Worker"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.bottomNav}>
        {bottomNavItems.map((item) => {
          const isActive = item.label === "Home";
          return (
            <TouchableOpacity
              key={item.label}
              style={styles.navItem}
              onPress={() => {
                if (item.route) navigation.navigate(item.route);
              }}
            >
              <Feather name={item.icon} size={22} color={isActive ? "#0F172A" : "#94A3B8"} />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={ashaModalOpen} transparent animationType="slide" onRequestClose={() => setAshaModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ASHA Workers Nearby</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setAshaModalOpen(false)}>
                <Feather name="x" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>
            {ashaLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color="#5DC1B9" />
                <Text style={styles.modalHint}>Fetching ASHA workers...</Text>
              </View>
            ) : ashaError ? (
              <Text style={styles.modalError}>{ashaError}</Text>
            ) : ashaWorkers.length === 0 ? (
              <Text style={styles.modalHint}>No ASHA workers found.</Text>
            ) : (
              <ScrollView style={styles.modalList}>
                {ashaWorkers.map((worker) => {
                  const distance = calcDistanceKm(activeUser?.locationCoordinates, worker.locationCoordinates);
                  return (
                    <View key={worker._id} style={styles.workerCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workerName}>{worker.name}</Text>
                        <Text style={styles.workerMeta}>@{worker.username}</Text>
                        <Text style={styles.workerMeta}>
                          {distance ? `${distance.toFixed(1)} km away` : "Nearby"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.workerButton}
                        disabled={assigning}
                        onPress={() => handleConnectAsha(worker)}
                      >
                        <Text style={styles.workerButtonText}>
                          {assigning && selectedAsha?._id === worker._id ? "Connecting..." : "Connect"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={doctorModalOpen} transparent animationType="slide" onRequestClose={closeDoctorModal}>
        <Pressable style={styles.modalOverlay} onPress={closeDoctorModal}>
          <Pressable style={styles.doctorSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Doctor Snapshot</Text>
              <TouchableOpacity style={styles.modalClose} onPress={closeDoctorModal}>
                <Feather name="x" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>
            {selectedDoctor ? (
              <>
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetAvatarWrap}>
                    <Image source={require("../../assets/male-doctor-icon.png")} style={styles.sheetAvatar} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetName}>{selectedDoctor.name || "Doctor"}</Text>
                    <Text style={styles.sheetMeta}>{selectedDoctor.specialization || "General Practice"}</Text>
                    <Text style={styles.sheetMeta}>{selectedDoctor.hospitalName || "Nearby Hospital"}</Text>
                  </View>
                </View>

                <View style={styles.sheetStatsRow}>
                  <View style={styles.sheetStatCard}>
                    <Text style={styles.sheetStatLabel}>Distance</Text>
                    <Text style={styles.sheetStatValue}>
                      {selectedDoctor.distanceKm ? `${selectedDoctor.distanceKm} km` : "Nearby"}
                    </Text>
                  </View>
                  <View style={styles.sheetStatCard}>
                    <Text style={styles.sheetStatLabel}>Experience</Text>
                    <Text style={styles.sheetStatValue}>
                      {selectedDoctor.experienceYears ? `${selectedDoctor.experienceYears}+ yrs` : "-"}
                    </Text>
                  </View>
                </View>

                <View style={styles.sheetRow}>
                  <Text style={styles.sheetRowLabel}>Availability</Text>
                  <Text style={styles.sheetRowValue}>{selectedDoctor.availability || "Check schedule"}</Text>
                </View>
                {selectedDoctor.phoneNumber ? (
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetRowLabel}>Phone</Text>
                    <Text style={styles.sheetRowValue}>{selectedDoctor.phoneNumber}</Text>
                  </View>
                ) : null}

                {Array.isArray(selectedDoctor.languages) && selectedDoctor.languages.length ? (
                  <>
                    <Text style={styles.sheetSectionTitle}>Languages</Text>
                    <View style={styles.sheetPillRow}>
                      {selectedDoctor.languages.map((lang) => (
                        <View key={lang} style={styles.sheetPill}>
                          <Text style={styles.sheetPillText}>{lang}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={styles.sheetPrimaryButton}
                    onPress={() => {
                      closeDoctorModal();
                      navigation.navigate("PatientConsult");
                    }}
                  >
                    <Text style={styles.sheetPrimaryText}>Book Appointment</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={searching} transparent animationType="fade">
        <View style={styles.searchOverlay}>
          <View style={styles.searchCard}>
            <Text style={styles.searchTitle}>Locating ASHA Worker</Text>
            <Text style={styles.searchSubtitle}>
              {selectedAsha?.name ? `Connecting to ${selectedAsha.name}` : "Searching nearby on the map"}
            </Text>
            <View style={styles.searchMap}>
              <View style={styles.mapGridLine} />
              <View style={[styles.mapGridLine, styles.mapGridLineAlt]} />
              <View style={styles.mapGridLineVertical} />
              <View style={[styles.mapGridLineVertical, styles.mapGridLineAlt]} />
              <Animated.View
                style={[
                  styles.mapPulse,
                  {
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] }) }],
                  },
                ]}
              />
              <View style={styles.mapDot} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAFB",
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  greetingSmall: {
    fontSize: 15,
    color: "#7A8798",
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 2,
  },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#5DC1B9",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  headerAvatar: {
    width: 32,
    height: 32,
  },
  statusBanner: {
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E6EEF0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  statusBannerHigh: {
    borderColor: "#FEE2E2",
    backgroundColor: "#FEF2F2",
  },
  statusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F0FBFA",
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  statusSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
  },
  statusCaption: {
    marginTop: 4,
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  predictionCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E6EEF0",
  },
  predictionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  predictionEyebrow: {
    fontSize: 11,
    color: "#64748B",
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  predictionTitle: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  predictionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  predictionBadgeHigh: {
    backgroundColor: "#FEE2E2",
  },
  predictionBadgeMedium: {
    backgroundColor: "#FEF3C7",
  },
  predictionBadgeLow: {
    backgroundColor: "#DCFCE7",
  },
  predictionBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  predictionSummary: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
  },
  predictionMetaRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  predictionMetaCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  predictionMetaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  predictionMetaValue: {
    marginTop: 6,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "700",
  },
  homeFormGrid: {
    marginTop: 16,
    gap: 10,
  },
  homeInputCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  homeInputLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "700",
  },
  homeInput: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
  },
  homeSectionLabel: {
    marginTop: 16,
    fontSize: 13,
    color: "#475569",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  optionRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  optionPill: {
    minWidth: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  optionPillActive: {
    backgroundColor: "#0F172A",
  },
  optionPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  optionPillTextActive: {
    color: "#FFFFFF",
  },
  toggleWrap: {
    marginTop: 10,
    gap: 10,
  },
  toggleRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleRowActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#86EFAC",
  },
  toggleText: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  toggleTextActive: {
    color: "#166534",
  },
  toggleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  toggleBadgeActive: {
    backgroundColor: "#16A34A",
  },
  toggleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  toggleBadgeTextActive: {
    color: "#FFFFFF",
  },
  reasonsWrap: {
    marginTop: 14,
    gap: 8,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    color: "#334155",
    lineHeight: 18,
    fontWeight: "500",
  },
  homeActionRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#E2E8F0",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  avatarMenuWrap: {
    alignItems: "flex-end",
  },
  avatarMenu: {
    position: "absolute",
    top: 60,
    right: 0,
    width: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6F2F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  menuText: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "600",
  },
  menuTextDanger: {
    color: "#DC2626",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 18,
    marginBottom: 12,
  },
  sectionRow: {
    marginTop: 20,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLink: {
    fontSize: 14,
    color: "#5DC1B9",
    fontWeight: "600",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 14,
  },
  quickCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingVertical: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },
  quickIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E8F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  quickTitle: {
    marginTop: 12,
    fontSize: 15,
    color: "#1F2937",
    fontWeight: "600",
    textAlign: "center",
  },
  doctorScroll: {
    paddingRight: 20,
    paddingBottom: 4,
  },
  doctorCard: {
    width: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    marginRight: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  doctorAvatarWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#F3F5F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  doctorAvatar: {
    width: 56,
    height: 56,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
  },
  doctorMeta: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  doctorDistTag: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#E8F6F4",
    borderRadius: 8,
  },
  doctorDistText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5DC1B9",
  },
  supportCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#EEF1F4",
  },
  supportIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E8F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  supportName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  supportRole: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },
  supportAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  connectButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    alignItems: "center",
  },
  connectButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  bottomNav: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    height: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  navItem: {
    alignItems: "center",
    gap: 4,
  },
  navLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
  navLabelActive: {
    color: "#0F172A",
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "75%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  modalLoading: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  modalHint: {
    color: "#64748B",
  },
  modalError: {
    color: "#DC2626",
    marginTop: 8,
  },
  modalList: {
    maxHeight: 340,
  },
  workerCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F4",
    gap: 12,
  },
  workerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  workerMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  workerButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#5DC1B9",
  },
  workerButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  doctorSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    minHeight: "45%",
    maxHeight: "60%",
  },
  sheetHeader: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginTop: 4,
  },
  sheetAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E8F6F4",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetAvatar: {
    width: 42,
    height: 42,
  },
  sheetName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  sheetMeta: {
    marginTop: 2,
    fontSize: 13,
    color: "#64748B",
  },
  sheetStatsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
  },
  sheetStatCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sheetStatLabel: {
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  sheetStatValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  sheetRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetRowLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  sheetRowValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  sheetSectionTitle: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  sheetPillRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sheetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF7F6",
  },
  sheetPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F766E",
  },
  sheetActions: {
    marginTop: 20,
  },
  sheetPrimaryButton: {
    backgroundColor: "#5DC1B9",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  sheetPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  searchOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  searchCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  searchSubtitle: {
    marginTop: 6,
    color: "#64748B",
    textAlign: "center",
  },
  searchMap: {
    marginTop: 16,
    width: "100%",
    height: 180,
    borderRadius: 16,
    backgroundColor: "#E8F6F4",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mapGridLine: {
    position: "absolute",
    width: "100%",
    height: 1,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    top: "35%",
  },
  mapGridLineAlt: {
    top: "65%",
  },
  mapGridLineVertical: {
    position: "absolute",
    height: "100%",
    width: 1,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    left: "35%",
  },
  mapDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#0F172A",
  },
  mapPulse: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
});
