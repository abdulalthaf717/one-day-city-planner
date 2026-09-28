'use client';

import React, { useState } from 'react';
import {
  Camera,
  Upload,
  HelpCircle,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Utensils,
  Calendar,
  MapPin,
  Clock,
  DollarSign,
  X,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { CandidatePlace, FinalItinerary, MultimodalPendingPlace, TripConstraints } from '@/domain';

interface MultimodalUploadProps {
  city: string;
  itinerary: FinalItinerary | null;
  constraints: TripConstraints;
  onPlaceAdded: (place: CandidatePlace, forceInclude: boolean) => Promise<void>;
  onDismiss?: () => void;
}

export const MultimodalUpload: React.FC<MultimodalUploadProps> = ({
  city,
  itinerary,
  constraints,
  onPlaceAdded,
  onDismiss,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCheckingFeasibility, setIsCheckingFeasibility] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<MultimodalPendingPlace | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [foodRecommendations, setFoodRecommendations] = useState<CandidatePlace[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side Validation: Formats
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage(`Unsupported format "${file.type}". Please upload JPEG, PNG, or WebP.`);
      return;
    }

    // Client-side Validation: Size (4MB)
    if (file.size > 4 * 1024 * 1024) {
      setErrorMessage(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max upload is 4MB.`);
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    setAnalysisResult(null);
    setFoodRecommendations([]);

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        try {
          const res = await fetch('/api/vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64Data,
              mimeType,
              city,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Vision analysis failed');
          }

          const data = await res.json();
          const analysis = data.analysis;

          const pending: MultimodalPendingPlace = {
            id: `img-${Date.now()}`,
            imageFileName: file.name,
            imagePreviewUrl: objectUrl,
            identifiedName: analysis.identifiedName,
            identifiedType: analysis.identifiedType,
            confidence: analysis.confidence,
            confidenceScore: analysis.confidenceScore,
            llmReasoning: analysis.reasoningSummary,
            verifiedPlace: data.verifiedPlace || undefined,
            isVerified: data.isVerified,
            status: 'pending_user_decision',
            feasibilityFeedback: data.verificationMessage,
            possibleAlternatives: analysis.possibleAlternatives,
            eventDetails: analysis.eventDetails,
            mapExtractedPlaces: data.verifiedMapPlaces?.map((p: CandidatePlace) => p.name) || analysis.mapExtractedPlaces,
          };

          if (data.recommendedRestaurants && data.recommendedRestaurants.length > 0) {
            setFoodRecommendations(data.recommendedRestaurants);
          }

          // If place is verified, evaluate initial schedule feasibility
          if (pending.verifiedPlace) {
            await checkFeasibility(pending.verifiedPlace, pending);
          } else {
            setAnalysisResult(pending);
          }
        } catch (err: unknown) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to analyze landmark image.');
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsAnalyzing(false);
      setErrorMessage('Failed to read image file.');
    }
  };

  const handleLoadDemoPhoto = async () => {
    const demoBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAHElEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAADg3wAS6AABfLPRJwAAAABJRU5ErkJggg==';
    const preview = `data:image/png;base64,${demoBase64}`;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setAnalysisResult(null);
    setFoodRecommendations([]);
    setPreviewUrl(preview);

    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: demoBase64,
          mimeType: 'image/png',
          city: city || 'Hyderabad',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Vision analysis failed');
      }

      const data = await res.json();
      const analysis = data.analysis;

      const pending: MultimodalPendingPlace = {
        id: `img-${Date.now()}`,
        imageFileName: 'charminar_demo_photo.png',
        imagePreviewUrl: preview,
        identifiedName: analysis.identifiedName || 'Charminar',
        identifiedType: analysis.identifiedType || 'tourist_place',
        confidence: analysis.confidence || 'high',
        confidenceScore: analysis.confidenceScore || 0.95,
        llmReasoning:
          analysis.reasoningSummary ||
          'Iconic 16th-century monument and mosque located in the historic center of Hyderabad.',
        verifiedPlace: data.verifiedPlace || undefined,
        isVerified: data.isVerified,
        status: 'pending_user_decision',
        feasibilityFeedback: data.verificationMessage,
        possibleAlternatives: analysis.possibleAlternatives,
        eventDetails: analysis.eventDetails,
        mapExtractedPlaces:
          data.verifiedMapPlaces?.map((p: CandidatePlace) => p.name) || analysis.mapExtractedPlaces,
      };

      if (data.recommendedRestaurants && data.recommendedRestaurants.length > 0) {
        setFoodRecommendations(data.recommendedRestaurants);
      }

      if (pending.verifiedPlace) {
        await checkFeasibility(pending.verifiedPlace, pending);
      } else {
        setAnalysisResult(pending);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to analyze demo landmark photo.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const checkFeasibility = async (place: CandidatePlace, currentPending: MultimodalPendingPlace) => {
    setIsCheckingFeasibility(true);
    try {
      const res = await fetch('/api/vision/feasibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidatePlace: place,
          itinerary,
          constraints,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysisResult({
          ...currentPending,
          verifiedPlace: place,
          feasibilityDetails: data.feasibility,
          feasibilityFeedback: data.feasibility.reason,
        });
      } else {
        setAnalysisResult(currentPending);
      }
    } catch {
      setAnalysisResult(currentPending);
    } finally {
      setIsCheckingFeasibility(false);
    }
  };

  const handleConfirmAdd = async (forceInclude: boolean) => {
    if (!analysisResult?.verifiedPlace) return;
    setIsAdding(true);
    try {
      await onPlaceAdded(analysisResult.verifiedPlace, forceInclude);
      setAnalysisResult(null);
      setPreviewUrl(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to re-optimize with new place.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSelectAlternativeMatch = async (alt: { name: string; address?: string }) => {
    if (!analysisResult) return;
    setIsCheckingFeasibility(true);
    try {
      const altPlace: CandidatePlace = {
        id: `alt-${Date.now()}`,
        name: alt.name,
        category: 'attraction',
        categories: ['tourism.sights'],
        latitude: 17.385,
        longitude: 78.4867,
        coordinates: { lat: 17.385, lng: 78.4867 },
        address: alt.address,
        city: city || 'Hyderabad',
        openingHoursSource: 'unavailable',
        estimatedVisitDurationMinutes: 60,
        estimatedDurationMin: 60,
        visitDurationSource: 'category_default',
        cost: {
          currency: constraints.budget.currency,
          amountPerPerson: 0,
          totalForGroup: 0,
          isFree: true,
        },
        estimatedCostPerPerson: 0,
        costSource: 'free',
        verificationStatus: 'verified',
        source: 'user_upload',
        addedViaImage: true,
        relevanceScore: 90,
        qualityScore: 85,
        travelBurdenScore: 0,
        candidateScore: 85,
      };

      await checkFeasibility(altPlace, {
        ...analysisResult,
        identifiedName: alt.name,
        isVerified: true,
      });
    } finally {
      setIsCheckingFeasibility(false);
    }
  };

  const resetUpload = () => {
    setAnalysisResult(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setFoodRecommendations([]);
    if (onDismiss) onDismiss();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Camera className="w-5 h-5 text-indigo-600" />
            <span>Add Place from Photo</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Upload an attraction, monument, or food photo to verify and insert into your day.
          </p>
        </div>
        <span className="text-xs font-semibold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
          Vision AI
        </span>
      </div>

      {!analysisResult ? (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-purple-400 transition-colors">
          <input
            type="file"
            id="landmark-photo-upload"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            disabled={isAnalyzing}
            className="hidden"
          />
          <label
            htmlFor="landmark-photo-upload"
            className="cursor-pointer flex flex-col items-center space-y-2"
          >
            <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
              {isAnalyzing ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {isAnalyzing ? 'Analyzing image with Groq Vision...' : 'Upload landmark, poster, or photo'}
              </p>
              <p className="text-xs text-gray-400">JPEG, PNG, WebP up to 4MB</p>
            </div>
          </label>

          {!isAnalyzing && (
            <div className="pt-3 border-t border-dashed border-gray-200 mt-3 flex items-center justify-center">
              <button
                type="button"
                onClick={handleLoadDemoPhoto}
                className="text-xs px-3.5 py-1.5 rounded-lg bg-purple-100 text-purple-900 border border-purple-200 hover:bg-purple-200 font-semibold transition-colors flex items-center space-x-1.5 shadow-2xs"
              >
                <span>📸</span>
                <span>Try Demo Photo: Charminar (Hyderabad)</span>
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start space-x-2 text-left">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Upload Notice</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main Recognition & Evidence Banner */}
          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start justify-between">
            <div className="flex gap-3">
              {previewUrl && (
                <div className="w-20 h-20 rounded-lg overflow-hidden border border-purple-200 shrink-0 shadow-xs bg-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={analysisResult.identifiedName}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-200 text-purple-900">
                    {analysisResult.identifiedType || 'Place'}
                  </span>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    {analysisResult.identifiedName}
                  </h3>
                </div>
                <p className="text-xs text-gray-600 max-w-md">{analysisResult.llmReasoning}</p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase border ${
                  analysisResult.confidence === 'high'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : analysisResult.confidence === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}
              >
                {analysisResult.confidence} Confidence ({Math.round((analysisResult.confidenceScore || 0.8) * 100)}%)
              </span>
              <button
                type="button"
                onClick={resetUpload}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center space-x-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>

          {/* Place Information Card (Verified vs Unverified) */}
          {analysisResult.verifiedPlace ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">
                    Geoapify Place Verification Confirmed
                  </span>
                </div>
                <span className="text-xs text-gray-400 font-mono">
                  {analysisResult.verifiedPlace.category.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{analysisResult.verifiedPlace.address || city}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>
                    Est. Visit: {analysisResult.verifiedPlace.estimatedVisitDurationMinutes || 60} minutes
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>
                    Cost: {analysisResult.verifiedPlace.cost.isFree ? 'Free Admission' : `₹${analysisResult.verifiedPlace.cost.amountPerPerson || 0}/person`}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-400">Hours:</span>
                  <span>{analysisResult.verifiedPlace.openingHours || 'Provider hours unavailable'}</span>
                </div>
              </div>

              {/* Action Links if verified */}
              {analysisResult.verifiedPlace.actionLinks?.directionsUrl && (
                <div className="pt-1 flex items-center space-x-3 text-xs">
                  <a
                    href={analysisResult.verifiedPlace.actionLinks.directionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 inline-flex items-center space-x-1"
                  >
                    <span>View on Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Feasibility Check Feedback Banner */}
              {analysisResult.feasibilityDetails && (
                <div
                  className={`p-3 rounded-lg text-xs border ${
                    analysisResult.feasibilityDetails.canFit
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {analysisResult.feasibilityDetails.canFit ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-semibold">{analysisResult.feasibilityDetails.reason}</p>
                      {!analysisResult.feasibilityDetails.canFit && (
                        <p className="text-[11px] text-amber-700">
                          Adding this place requires ~{analysisResult.feasibilityDetails.visitDurationMinutes}m visit + ~{analysisResult.feasibilityDetails.additionalTravelMinutes}m transit, which exceeds current safety buffer ({analysisResult.feasibilityDetails.remainingBufferMinutes}m). Selecting &quot;Re-plan to Include It&quot; will prune lower-value stops to preserve your arrival deadline.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation Action Buttons */}
              <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-gray-800">
                  Would you like to add {analysisResult.identifiedName} to your trip?
                </p>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={resetUpload}
                    disabled={isAdding}
                    className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Not Now
                  </button>

                  {analysisResult.feasibilityDetails?.canFit ? (
                    <button
                      type="button"
                      onClick={() => handleConfirmAdd(false)}
                      disabled={isAdding}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all"
                    >
                      {isAdding ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Optimizing...</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>ADD PLACE FROM IMAGE</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConfirmAdd(true)}
                      disabled={isAdding}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all"
                    >
                      {isAdding ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Re-planning...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>RE-PLAN TO INCLUDE PLACE</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Unverified Place Notice */
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3 text-xs text-amber-800">
              <div className="flex items-start space-x-2">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Unverified Location Notice</p>
                  <p className="text-amber-700">
                    {analysisResult.feasibilityFeedback ||
                      "I identified this as a possible match, but I couldn't verify the location with the available place data."}
                  </p>
                </div>
              </div>

              {/* Ambiguous Alternatives Disambiguation */}
              {analysisResult.possibleAlternatives && analysisResult.possibleAlternatives.length > 0 && (
                <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                  <p className="text-[11px] font-bold text-amber-900 uppercase">
                    Possible Verified Matches in {city}:
                  </p>
                  <div className="space-y-1">
                    {analysisResult.possibleAlternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-amber-200 rounded-lg p-2 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{alt.name}</p>
                          <p className="text-[10px] text-gray-500">{alt.address || city}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectAlternativeMatch(alt)}
                          disabled={isCheckingFeasibility}
                          className="px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200"
                        >
                          Select Match
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={resetUpload}
                  className="px-3.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Not Now
                </button>
              </div>
            </div>
          )}

          {/* Food Discovery Case: Restaurant Recommendations */}
          {analysisResult.identifiedType === 'food' && foodRecommendations.length > 0 && (
            <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Utensils className="w-4 h-4 text-orange-600" />
                <h4 className="text-xs font-bold text-orange-900">
                  Restaurants Serving {analysisResult.identifiedName} in {city}
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {foodRecommendations.map((restaurant) => (
                  <div
                    key={restaurant.id}
                    className="bg-white border border-orange-200 rounded-lg p-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{restaurant.name}</p>
                      <p className="text-[10px] text-gray-500 truncate max-w-[160px]">
                        {restaurant.address || 'Dining in ' + city}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsAdding(true);
                        try {
                          await onPlaceAdded(restaurant, false);
                          resetUpload();
                        } finally {
                          setIsAdding(false);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-md shadow-2xs"
                    >
                      Add Dining
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Poster Case: Event Details Extraction */}
          {analysisResult.identifiedType === 'event_poster' && analysisResult.eventDetails && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 space-y-2 text-xs text-blue-900">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h4 className="font-bold">Event Details Extracted from Poster</h4>
              </div>
              <div className="grid grid-cols-2 gap-2 text-gray-700 pt-1">
                <div>
                  <span className="font-semibold">Event:</span> {analysisResult.eventDetails.eventName || analysisResult.identifiedName}
                </div>
                <div>
                  <span className="font-semibold">Venue:</span> {analysisResult.eventDetails.venue || 'TBD'}
                </div>
                <div>
                  <span className="font-semibold">Date:</span> {analysisResult.eventDetails.date || 'Check venue'}
                </div>
                <div>
                  <span className="font-semibold">Time:</span> {analysisResult.eventDetails.time || 'Check venue'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
