import { useEffect, useMemo, useReducer, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Languages } from "lucide-react";
import type {
  Complaint,
  ComplaintCategory,
  ComplaintLanguage,
  ComplaintSource,
  District,
} from "@civicpulse/shared";
import { countLetters, detectLanguage } from "../../../shared/utils/detectScript.js";
import type { LanguageDetection } from "../../../shared/utils/detectScript.js";
import type { IndiaAdminState } from "../../../shared/data/indiaAdmin.js";
import {
  getLocationSuggestion,
  previewClassification,
  submitWizardComplaint,
  type ClassificationPreview,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { LocationPicker } from "./LocationPicker";
import type { Coordinates } from "./LeafletLocationMap";
import { CategoryChips, categoryLabels } from "./CategoryChips";
import { PhotoUpload } from "./PhotoUpload";
import { ReviewStep } from "./ReviewStep";
import { StepIndicator } from "./StepIndicator";
import { UrgencySelector } from "./UrgencySelector";
import { VoiceRecorder } from "./VoiceRecorder";

type Urgency = NonNullable<Complaint["urgency"]>;
type AffectedScale = NonNullable<Complaint["affectedScale"]>;
type Duration = NonNullable<Complaint["duration"]>;
type Step = 1 | 2 | 3 | 4;
type ErrorKey = "report" | "urgency" | "location" | "district" | "phone" | "consent";

interface FormState {
  step: Step;
  text: string;
  language: ComplaintLanguage | "auto";
  languageManual: boolean;
  languageDetection: LanguageDetection;
  languageDetectionText: string;
  source: ComplaintSource;
  voice: File | null;
  category: ComplaintCategory | null;
  urgency: Urgency | "";
  affectedScale: AffectedScale | "";
  duration: Duration | "";
  photos: File[];
  photoError: string;
  location: Coordinates | null;
  locationSuggestion: District | null;
  locationSuggestionLoading: boolean;
  locationSuggestionError: string;
  stateName: string;
  districtId: string;
  districtManual: boolean;
  landmark: string;
  isAnonymous: boolean;
  phone: string;
  consent: boolean;
  districts: District[];
  adminStates: IndiaAdminState[];
  adminLoading: boolean;
  adminError: string;
  stateSearch: string;
  districtSearch: string;
  categoryPreview: ClassificationPreview | null;
  categoryPreviewLoading: boolean;
  submitting: boolean;
  submitError: string;
  errors: Partial<Record<ErrorKey, string>>;
  result: Complaint | null;
  draftRestored: boolean;
}

type Action =
  | { type: "PATCH"; value: Partial<FormState> }
  | { type: "STEP"; value: Step }
  | { type: "LOCATION_LOOKUP_START" }
  | { type: "LOCATION_LOOKUP_RESULT"; value: District | null }
  | { type: "RESET" };

const DRAFT_KEY = "civicpulse-report-draft";

function readDraft(): Partial<FormState> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveDraft(state: FormState): void {
  try {
    const payload = {
      text: state.text,
      category: state.category,
      urgency: state.urgency,
      affectedScale: state.affectedScale,
      duration: state.duration,
      landmark: state.landmark,
      location: state.location,
      stateName: state.stateName,
      districtId: state.districtId,
      language: state.language,
      source: state.source,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

const initialState: FormState = {
  step: 1,
  text: "",
  language: "auto",
  languageManual: false,
  languageDetection: detectLanguage(""),
  languageDetectionText: "",
  source: "text",
  voice: null,
  category: null,
  urgency: "",
  affectedScale: "",
  duration: "",
  photos: [],
  photoError: "",
  location: null,
  locationSuggestion: null,
  locationSuggestionLoading: false,
  locationSuggestionError: "",
  stateName: "",
  districtId: "",
  districtManual: false,
  landmark: "",
  isAnonymous: false,
  phone: "",
  consent: false,
  districts: [],
  adminStates: [],
  adminLoading: true,
  adminError: "",
  stateSearch: "",
  districtSearch: "",
  categoryPreview: null,
  categoryPreviewLoading: false,
  submitting: false,
  submitError: "",
  errors: {},
  result: null,
  draftRestored: false,
};

function canonicalDistrictRecord(
  state: FormState,
  districtId: string,
  stateName: string,
): District | undefined {
  const catalogDistrict = state.adminStates
    .find((item) => item.name === stateName)
    ?.districts.find((item) => item.id === districtId);
  if (!catalogDistrict) return undefined;
  const existing = state.districts.find((item) => item.id === districtId);
  return {
    id: catalogDistrict.id,
    name: catalogDistrict.name,
    country: "India",
    state: stateName,
    lat: existing?.lat ?? state.location?.lat ?? 0,
    lng: existing?.lng ?? state.location?.lng ?? 0,
    infraScore: existing?.infraScore ?? 5,
    population: existing?.population ?? null,
  };
}

function reducer(state: FormState, action: Action): FormState {
  if (action.type === "STEP") return { ...state, step: action.value, errors: {} };
  if (action.type === "LOCATION_LOOKUP_START") {
    return {
      ...state,
      locationSuggestion: null,
      locationSuggestionLoading: true,
      locationSuggestionError: "",
    };
  }
  if (action.type === "LOCATION_LOOKUP_RESULT") {
    const suggestion = action.value;
    return {
      ...state,
      districts: suggestion
        ? [...state.districts.filter((district) => district.id !== suggestion.id), suggestion]
        : state.districts,
      locationSuggestion: suggestion,
      locationSuggestionLoading: false,
      locationSuggestionError: suggestion
        ? ""
        : "Could not detect district, please choose it below.",
      ...(!state.districtManual && suggestion
        ? { stateName: suggestion.state, districtId: suggestion.id }
        : {}),
    };
  }
  if (action.type === "RESET") {
    return {
      ...initialState,
      districts: state.districts,
      adminStates: state.adminStates,
      adminLoading: false,
      adminError: state.adminError,
    };
  }

  return { ...state, ...action.value };
}

function initialDraft(value: string): FormState {
  return { ...initialState, text: value };
}

function validateStep(state: FormState, step: Step): Partial<Record<ErrorKey, string>> {
  if (step === 1 && !state.text.trim()) {
    return { report: "Describe the issue or add a voice recording to fill the text box." };
  }
  if (step === 2 && !state.urgency) return { urgency: "Choose an urgency level to continue." };
  if (step === 3 && !state.location)
    return { location: "Pin the location or use GPS to continue." };
  if (step === 3 && (!state.stateName || !state.districtId))
    return { district: "Choose a state and district to continue." };
  if (step === 4) {
    if (state.phone.trim() && !/^[6-9]\d{9}$/.test(state.phone.trim())) {
      return { phone: "Enter a valid 10-digit Indian mobile number." };
    }
    if (!state.consent) return { consent: "Confirm this report before sending." };
  }
  return {};
}

export interface ComplaintFormProps {
  initialValue: string;
  initialLanguage: ComplaintLanguage | "auto";
  onLanguageChange: (language: ComplaintLanguage | "auto") => void;
  onClearInitialValue: () => void;
}

export function ComplaintForm({
  initialValue,
  initialLanguage,
  onLanguageChange,
  onClearInitialValue,
}: ComplaintFormProps) {
  const [state, dispatch] = useReducer(
    reducer,
    { value: initialValue, language: initialLanguage },
    ({ value, language }) => ({ ...initialDraft(value), language }),
  );
  const districtSelectRef = useRef<HTMLSelectElement>(null);
  const previewSequenceRef = useRef(0);
  const lastPreviewRequestAtRef = useRef(0);
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const selectedState = state.adminStates.find((item) => item.name === state.stateName);
  const states = useMemo(
    () =>
      state.adminStates.filter(
        (item) =>
          item.name === state.stateName ||
          item.name.toLowerCase().includes(state.stateSearch.toLowerCase()),
      ),
    [state.adminStates, state.stateName, state.stateSearch],
  );
  const stateDistricts = useMemo(
    () =>
      (selectedState?.districts ?? []).filter(
        (district) =>
          district.id === state.districtId ||
          district.name.toLowerCase().includes(state.districtSearch.toLowerCase()),
      ),
    [selectedState, state.districtId, state.districtSearch],
  );

  useEffect(() => {
    if (initialValue) dispatch({ type: "PATCH", value: { text: initialValue } });
  }, [initialValue]);

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    dispatch({
      type: "PATCH",
      value: {
        ...draft,
        draftRestored: true,
        errors: {},
        categoryPreview: null,
      },
    });
  }, []);

  useEffect(() => {
    saveDraft(state);
  }, [state.category, state.duration, state.landmark, state.language, state.location, state.stateName, state.text, state.urgency, state.affectedScale, state.source, state.districtId]);

  useEffect(() => {
    const text = state.text;
    const timer = window.setTimeout(() => {
      const detection = detectLanguage(text);
      const language = countLetters(text) >= 8 ? detection.code : "auto";
      dispatch({
        type: "PATCH",
        value: {
          languageDetection: detection,
          languageDetectionText: text,
          ...(!state.languageManual ? { language } : {}),
        },
      });
      if (!state.languageManual) onLanguageChange(language);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onLanguageChange, state.languageManual, state.text]);

  useEffect(() => {
    let active = true;
    void import("../../../shared/data/indiaAdmin.js")
      .then(({ INDIA_ADMIN_STATES }) => {
        if (active)
          dispatch({
            type: "PATCH",
            value: { adminStates: [...INDIA_ADMIN_STATES], adminLoading: false },
          });
      })
      .catch((cause: unknown) => {
        if (active) {
          dispatch({
            type: "PATCH",
            value: {
              adminLoading: false,
              adminError:
                cause instanceof Error
                  ? cause.message
                  : "India state and district data could not be loaded.",
            },
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const sequence = ++previewSequenceRef.current;
    const text = state.text.trim();
    if (text.length < 20 || state.category) {
      dispatch({
        type: "PATCH",
        value: { categoryPreview: null, categoryPreviewLoading: false },
      });
      return;
    }

    const controller = new AbortController();
    dispatch({
      type: "PATCH",
      value: { categoryPreview: null, categoryPreviewLoading: true },
    });
    let throttleTimer = 0;
    const debounceTimer = window.setTimeout(() => {
      const wait = Math.max(0, 2000 - (Date.now() - lastPreviewRequestAtRef.current));
      throttleTimer = window.setTimeout(() => {
        lastPreviewRequestAtRef.current = Date.now();
        void previewClassification(text, controller.signal)
          .then((preview) => {
            if (controller.signal.aborted || sequence !== previewSequenceRef.current) return;
            dispatch({
              type: "PATCH",
              value: {
                categoryPreview: preview.category ? preview : null,
                categoryPreviewLoading: false,
              },
            });
          })
          .catch(() => {
            if (controller.signal.aborted || sequence !== previewSequenceRef.current) return;
            dispatch({
              type: "PATCH",
              value: { categoryPreview: null, categoryPreviewLoading: false },
            });
          });
      }, wait);
    }, 700);

    return () => {
      window.clearTimeout(debounceTimer);
      window.clearTimeout(throttleTimer);
      controller.abort();
    };
  }, [state.category, state.text]);

  useEffect(() => {
    const location = state.location;
    if (!location) return;
    const controller = new AbortController();
    dispatch({ type: "LOCATION_LOOKUP_START" });
    const timer = window.setTimeout(() => {
      void getLocationSuggestion(location.lat, location.lng, controller.signal)
        .then(({ suggestion }) => {
          if (!controller.signal.aborted) {
            dispatch({ type: "LOCATION_LOOKUP_RESULT", value: suggestion });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            dispatch({ type: "LOCATION_LOOKUP_RESULT", value: null });
          }
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state.location]);

  function moveTo(next: Step) {
    const errors = validateStep(state, state.step);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: "PATCH", value: { errors } });
      return;
    }
    dispatch({ type: "STEP", value: next });
  }

  async function submit() {
    const errors = validateStep(state, 4);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: "PATCH", value: { errors } });
      return;
    }
    if (!state.location) return;

    const form = new FormData();
    form.append("text", state.text.trim());
    form.append("lat", String(state.location.lat));
    form.append("lng", String(state.location.lng));
    form.append("language", state.language);
    form.append("source", state.source);
    if (state.category) form.append("userCategory", state.category);
    if (state.urgency) form.append("urgency", state.urgency);
    if (state.affectedScale) form.append("affectedScale", state.affectedScale);
    if (state.duration) form.append("duration", state.duration);
    if (state.stateName) form.append("stateName", state.stateName);
    if (state.districtId) form.append("districtId", state.districtId);
    if (state.landmark.trim()) form.append("landmark", state.landmark.trim());
    if (state.phone.trim()) form.append("contactPhone", state.phone.trim());
    form.append("isAnonymous", String(state.isAnonymous));
    state.photos.forEach((photo) => form.append("photos", photo));

    dispatch({ type: "PATCH", value: { submitting: true, submitError: "", result: null } });
    try {
      const response = await submitWizardComplaint(form);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore sessionStorage failures
      }
      dispatch({ type: "PATCH", value: { result: response.complaint } });
    } catch (cause) {
      dispatch({
        type: "PATCH",
        value: {
          submitError: cause instanceof Error ? cause.message : "Your report could not be sent.",
        },
      });
    } finally {
      dispatch({ type: "PATCH", value: { submitting: false } });
    }
  }

  function resetDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore sessionStorage failures
    }
    dispatch({ type: "RESET" });
    onLanguageChange("auto");
    onClearInitialValue();
  }

  function chooseDistrict(districtId: string) {
    const district = canonicalDistrictRecord(state, districtId, state.stateName);
    dispatch({
      type: "PATCH",
      value: {
        districtId,
        districtManual: true,
        districtSearch: "",
        districts: district
          ? [...state.districts.filter((item) => item.id !== districtId), district]
          : state.districts,
        errors: {},
      },
    });
  }

  function acceptLocationSuggestion() {
    const suggestion = state.locationSuggestion;
    if (!suggestion) return;
    dispatch({
      type: "PATCH",
      value: {
        stateName: suggestion.state,
        districtId: suggestion.id,
        districtManual: false,
        stateSearch: "",
        districtSearch: "",
        errors: {},
      },
    });
  }

  const phoneValid = !state.phone.trim() || /^[6-9]\d{9}$/.test(state.phone.trim());
  const categoryPreview = state.categoryPreview?.category ?? null;
  const canSubmit =
    state.consent &&
    phoneValid &&
    Boolean(state.text.trim()) &&
    Boolean(state.location && state.urgency) &&
    !state.submitting;

  return (
    <div className="form-column" id="report-form">
      <AnimatePresence mode="wait" initial={false}>
        {state.result ? (
          <motion.div
            key="success"
            className="report-card glass-panel"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          >
            <ReviewStep
              state={state}
              result={state.result}
              isLoggedIn={Boolean(user)}
              onNewReport={resetDraft}
            />
          </motion.div>
        ) : (
          <motion.form
            key={`step-${state.step}`}
            className="report-card glass-panel"
            onSubmit={(event) => {
              event.preventDefault();
              if (state.step < 4) moveTo((state.step + 1) as Step);
              else void submit();
            }}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          >
            <StepIndicator currentStep={state.step} />
            {state.step === 1 && (
              <section className="grid gap-5" aria-labelledby="what-happened-title">
                <div className="form-card-heading">
                  <div>
                    <span className="step-label">STEP 1 · WHAT HAPPENED</span>
                    <h2 id="what-happened-title">Tell us what needs attention</h2>
                  </div>
                </div>
                <label className="sr-only" htmlFor="complaint-text">
                  Describe the issue
                </label>
                <textarea
                  id="complaint-text"
                  className="complaint-input focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                  value={state.text}
                  onChange={(event) => {
                    previewSequenceRef.current += 1;
                    const text = event.target.value;
                    const cleared = text.length === 0;
                    dispatch({
                      type: "PATCH",
                      value: {
                        text,
                        languageDetectionText: "",
                        ...(cleared
                          ? { language: "auto", languageManual: false }
                          : !state.languageManual
                            ? { language: "auto" }
                            : {}),
                        categoryPreview: null,
                        categoryPreviewLoading: false,
                        errors: {},
                      },
                    });
                    if (cleared) onLanguageChange("auto");
                  }}
                  placeholder="A streetlight has been out on our block for two weeks…"
                  maxLength={5000}
                  rows={5}
                  aria-describedby="character-count"
                />
                <div className="input-meta">
                  <label className="language-chip" htmlFor="report-language">
                    <Languages size={14} />
                    <select
                      id="report-language"
                      aria-label="Report language"
                      value={
                        state.languageManual
                          ? state.language
                          : state.languageDetectionText === state.text &&
                              countLetters(state.text) >= 8
                            ? state.languageDetection.code
                            : "auto"
                      }
                      onChange={(event) => {
                        const language = event.target.value as ComplaintLanguage | "auto";
                        dispatch({
                          type: "PATCH",
                          value: {
                            language,
                            languageManual: language !== "auto",
                          },
                        });
                        onLanguageChange(language);
                      }}
                    >
                      <option value="auto">Detect automatically</option>
                      <option value="en">English</option>
                      <option value="hi">Hindi</option>
                      <option value="hi-Latn">Hinglish</option>
                      <option value="mr">Marathi</option>
                      <option value="bn">Bengali</option>
                      <option value="pa">Punjabi</option>
                      <option value="gu">Gujarati</option>
                      <option value="or">Odia</option>
                      <option value="ta">Tamil</option>
                      <option value="te">Telugu</option>
                      <option value="kn">Kannada</option>
                      <option value="ml">Malayalam</option>
                    </select>
                  </label>
                  <span id="character-count" className="character-count">
                    {state.text.length} / 5000
                  </span>
                </div>
                <div className="voice-divider">
                  <span>OR SHARE BY VOICE</span>
                </div>
                <VoiceRecorder
                  value={state.text}
                  reportLanguage={state.language}
                  onTranscript={(text) => {
                    previewSequenceRef.current += 1;
                    dispatch({
                      type: "PATCH",
                      value: {
                        text,
                        source: "voice",
                        languageDetectionText: "",
                        categoryPreview: null,
                        categoryPreviewLoading: false,
                        errors: {},
                      },
                    });
                  }}
                  disabled={state.submitting}
                />
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="m-0 text-sm font-semibold text-white">Choose a category</h3>
                    <span className="text-xs text-slate-400">You can change this later</span>
                  </div>
                  <CategoryChips
                    value={state.category}
                    suggestedCategory={categoryPreview}
                    onChange={(category) => {
                      previewSequenceRef.current += 1;
                      dispatch({ type: "PATCH", value: { category } });
                    }}
                  />
                </div>
                {state.categoryPreviewLoading && !state.category && (
                  <p className="m-0 text-xs text-slate-400" role="status" aria-live="polite">
                    AI is reading your report...
                  </p>
                )}
                {categoryPreview && !state.category && (
                  <p className="m-0 text-sm text-cyan-100" aria-live="polite">
                    AI detected: {categoryLabels[categoryPreview]}. Tap another to change.
                  </p>
                )}
                {state.errors.report && (
                  <p className="field-error" role="alert">
                    {state.errors.report}
                  </p>
                )}
              </section>
            )}
            {state.step === 2 && (
              <section className="grid gap-6" aria-labelledby="details-title">
                <div className="form-card-heading">
                  <div>
                    <span className="step-label">STEP 2 · DETAILS</span>
                    <h2 id="details-title">How is this affecting people?</h2>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-white">Urgency</h3>
                  <UrgencySelector
                    value={state.urgency}
                    onChange={(urgency) =>
                      dispatch({ type: "PATCH", value: { urgency, errors: {} } })
                    }
                  />
                  {state.errors.urgency && (
                    <p className="field-error" role="alert">
                      {state.errors.urgency}
                    </p>
                  )}
                </div>
                <label className="grid gap-2 text-sm text-slate-200">
                  Affected people
                  <select
                    className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    value={state.affectedScale}
                    onChange={(event) =>
                      dispatch({
                        type: "PATCH",
                        value: { affectedScale: event.target.value as AffectedScale | "" },
                      })
                    }
                  >
                    <option value="">Choose an area</option>
                    <option value="me">Just me</option>
                    <option value="street">My street</option>
                    <option value="neighbourhood">Neighbourhood</option>
                    <option value="wide_area">Whole area</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-200">
                  How long has this been happening?
                  <select
                    className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    value={state.duration}
                    onChange={(event) =>
                      dispatch({
                        type: "PATCH",
                        value: { duration: event.target.value as Duration | "" },
                      })
                    }
                  >
                    <option value="">Choose a duration</option>
                    <option value="under_1_week">Less than a week</option>
                    <option value="1_to_4_weeks">1 to 4 weeks</option>
                    <option value="1_to_6_months">1 to 6 months</option>
                    <option value="over_6_months">More than 6 months</option>
                  </select>
                </label>
                {state.draftRestored && (
                  <p className="m-0 text-sm text-amber-100">Please re-add your photos.</p>
                )}
                <PhotoUpload
                  files={state.photos}
                  error={state.photoError}
                  onFilesChange={(photos) => dispatch({ type: "PATCH", value: { photos } })}
                  onErrorChange={(photoError) => dispatch({ type: "PATCH", value: { photoError } })}
                />
              </section>
            )}
            {state.step === 3 && (
              <section className="grid gap-5" aria-labelledby="where-title">
                <div className="form-card-heading">
                  <div>
                    <span className="step-label">STEP 3 · WHERE</span>
                    <h2 id="where-title">Pin the place</h2>
                  </div>
                </div>
                <LocationPicker
                  value={state.location}
                  onChange={(location) =>
                    dispatch({
                      type: "PATCH",
                      value: { location, districtManual: false, errors: {} },
                    })
                  }
                />
                {state.adminLoading && (
                  <p role="status" className="text-sm text-slate-300">
                    Loading India states and districts…
                  </p>
                )}
                {state.adminError && (
                  <p role="alert" className="field-error">
                    {state.adminError}
                  </p>
                )}
                {state.locationSuggestionLoading && (
                  <p role="status" className="text-sm text-slate-300">
                    Detecting district…
                  </p>
                )}
                {state.locationSuggestionError && (
                  <p role="status" className="text-sm text-amber-100">
                    {state.locationSuggestionError}
                  </p>
                )}
                {!state.adminLoading && !state.adminError && state.adminStates.length === 0 && (
                  <p role="status" className="text-sm text-slate-300">
                    No Indian states are available yet.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid content-start gap-2 text-sm text-slate-200">
                    <label htmlFor="report-state-search">Search states</label>
                    <input
                      id="report-state-search"
                      className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      type="search"
                      value={state.stateSearch}
                      onChange={(event) =>
                        dispatch({ type: "PATCH", value: { stateSearch: event.target.value } })
                      }
                      placeholder="Type a state or union territory"
                      aria-label="Search Indian states and union territories"
                    />
                    <label htmlFor="report-state">State or union territory</label>
                    <select
                      id="report-state"
                      className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      value={state.stateName}
                      disabled={state.adminLoading || state.adminStates.length === 0}
                      onChange={(event) => {
                        const nextState = event.target.value;
                        dispatch({
                          type: "PATCH",
                          value: {
                            stateName: nextState,
                            districtId: "",
                            districtManual: true,
                            stateSearch: "",
                            districtSearch: "",
                            errors: {},
                          },
                        });
                      }}
                    >
                      <option value="">Select a state</option>
                      {states.map((adminState) => (
                        <option key={adminState.id} value={adminState.name}>
                          {adminState.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid content-start gap-2 text-sm text-slate-200">
                    <label htmlFor="report-district-search">Search districts</label>
                    <input
                      id="report-district-search"
                      className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      type="search"
                      value={state.districtSearch}
                      onChange={(event) =>
                        dispatch({ type: "PATCH", value: { districtSearch: event.target.value } })
                      }
                      placeholder="Type a district"
                      aria-label="Search districts in the selected state"
                      disabled={!state.stateName}
                    />
                    <label htmlFor="report-district">District</label>
                    <select
                      id="report-district"
                      ref={districtSelectRef}
                      className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      value={state.districtId}
                      disabled={!state.stateName || stateDistricts.length === 0}
                      onChange={(event) => chooseDistrict(event.target.value)}
                    >
                      <option value="">Select a district</option>
                      {stateDistricts.map((district) => (
                        <option key={district.id} value={district.id}>
                          {district.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {state.locationSuggestion && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400" aria-live="polite">
                    <span>
                      Detected: {state.locationSuggestion.name}, {state.locationSuggestion.state}
                    </span>
                    <button
                      type="button"
                      className="min-h-11 rounded-lg px-2 text-cyan-200 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      onClick={() => districtSelectRef.current?.focus()}
                    >
                      Change
                    </button>
                  </div>
                )}
                {state.locationSuggestion && (
                  <p className="m-0 text-xs text-slate-400">
                    Location details suggested by{" "}
                    <a
                      className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenStreetMap
                    </a>
                    . Verify or adjust the selection.
                  </p>
                )}
                {state.districtManual &&
                  state.locationSuggestion &&
                  (state.locationSuggestion.id !== state.districtId ||
                    state.locationSuggestion.state !== state.stateName) && (
                    <div className="flex flex-wrap items-center gap-3" role="status">
                      <p className="m-0 text-sm text-amber-100">
                        Pin is near {state.locationSuggestion.name}. Using your selection.
                      </p>
                      <button
                        type="button"
                        className="min-h-11 rounded-xl border border-cyan-300/30 px-3 text-sm text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        onClick={acceptLocationSuggestion}
                      >
                        Use detected
                      </button>
                    </div>
                  )}
                {state.errors.district && (
                  <p className="field-error" role="alert">
                    {state.errors.district}
                  </p>
                )}
                <label className="grid gap-2 text-sm text-slate-200">
                  Nearby landmark <span className="text-xs text-slate-400">Optional</span>
                  <input
                    className="min-h-12 rounded-xl border border-white/15 bg-slate-950/50 px-3 text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    value={state.landmark}
                    onChange={(event) =>
                      dispatch({ type: "PATCH", value: { landmark: event.target.value } })
                    }
                    maxLength={200}
                    placeholder="Near the temple, school, or market…"
                  />
                </label>
                {state.errors.location && (
                  <p className="field-error" role="alert">
                    {state.errors.location}
                  </p>
                )}
              </section>
            )}
            {state.step === 4 && (
              <section className="grid gap-5" aria-labelledby="review-title">
                <div className="form-card-heading">
                  <div>
                    <span className="step-label">STEP 4 · REVIEW &amp; SEND</span>
                    <h2 id="review-title">Check your report</h2>
                  </div>
                </div>
                <ReviewStep
                  state={state}
                  isLoggedIn={Boolean(user)}
                  onAnonymousChange={(isAnonymous) =>
                    dispatch({ type: "PATCH", value: { isAnonymous } })
                  }
                  onPhoneChange={(phone) =>
                    dispatch({ type: "PATCH", value: { phone, errors: {} } })
                  }
                  onConsentChange={(consent) =>
                    dispatch({ type: "PATCH", value: { consent, errors: {} } })
                  }
                  phoneError={
                    state.phone && !phoneValid
                      ? "Enter a valid 10-digit Indian mobile number."
                      : (state.errors.phone ?? "")
                  }
                  consentError={state.errors.consent ?? ""}
                />
                {state.submitError && (
                  <p className="form-error" role="alert">
                    {state.submitError}
                  </p>
                )}
                <button
                  type="submit"
                  className="submit-button min-h-12"
                  disabled={!canSubmit}
                  aria-busy={state.submitting}
                >
                  {state.submitting ? "Sending report…" : "Submit report"}
                </button>
              </section>
            )}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
              {state.step > 1 ? (
                <button
                  type="button"
                  className="min-h-11 rounded-xl border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                  onClick={() => dispatch({ type: "STEP", value: (state.step - 1) as Step })}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              {state.step < 4 && (
                <button
                  type="submit"
                  className="submit-button min-h-11"
                  aria-label={`Continue to step ${state.step + 1}`}
                >
                  Next
                </button>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
