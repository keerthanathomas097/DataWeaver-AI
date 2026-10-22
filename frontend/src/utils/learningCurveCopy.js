/**
 * Plain-language user-facing copy for the Learning Curve feature.
 * Strict constraint: No technical jargon (no "logistic regression", "balanced accuracy",
 * "embedding", "DINOv2", "fold", "stratified").
 */

export const LEARNING_CURVE_COPY = {
  header: {
    title: 'Learning Curve',
    subtitle: 'Evaluate whether collecting more images would meaningfully improve model performance.',
    scoreDefinition: 'how often the test model labels unseen images correctly, averaged fairly across classes',
  },

  verdicts: {
    still_improving: {
      headline: 'More images would likely help',
      sentiment: 'positive',
      summary: 'Performance is still rising as more images are added. Collecting more photos of these classes will likely produce higher accuracy.',
      iconType: 'trending-up',
    },
    levelling_off: {
      headline: 'More images of the same kind are unlikely to help much',
      sentiment: 'neutral',
      summary: 'Performance plateaus after a moderate number of images. Adding more similar photos will have diminishing returns; consider addressing image variety, lighting, or subtle edge cases instead.',
      iconType: 'minus',
    },
    flat_from_start: {
      headline: 'This dataset is easy to learn, even with a small share of the images',
      sentiment: 'positive',
      summary: 'The test model easily distinguishes these classes even with very few training images. The visual features are distinct and consistent.',
      iconType: 'check-circle',
    },
    weak_signal: {
      headline: "The test model struggles to tell these classes apart, so more images alone probably won't fix it. Check the labels and look-alike classes below.",
      sentiment: 'negative',
      summary: 'Performance stays near guessing levels regardless of dataset size. This usually indicates overlapping classes, subtle visual differences beyond basic shapes, or mislabelled photos.',
      iconType: 'alert-triangle',
    },
  },

  caveats: {
    small_dataset: {
      label: 'Small dataset',
      plainText: 'Some classes have fewer than 50 images, so estimates have wider uncertainty.',
    },
    grouping_fallback: {
      label: 'Grouping notice',
      plainText: 'Near-duplicate images could not be kept apart in this test, so the score may look better than it really is.',
      isWarning: true,
    },
    sampled_subset: {
      label: 'Representative sample',
      plainText: 'Measured on a representative sample of 5,000 images for responsive analysis.',
    },
    baseline_test_model: {
      label: 'Baseline estimate',
      plainText: 'Baseline estimate from a simple test model; a larger or custom model may behave differently.',
    },
  },

  unrun: {
    title: 'Would more images help this dataset?',
    intro: 'Before investing time collecting thousands more photos, test whether additional images actually improve class discrimination.',
    steps: [
      {
        number: '1',
        title: 'Set images aside',
        desc: 'We set some unseen images aside strictly for testing.',
      },
      {
        number: '2',
        title: 'Train at increasing shares',
        desc: 'We train a simple test model on 10%, 25%, 50%, 75%, and 100% of the remaining images.',
      },
      {
        number: '3',
        title: 'Score on unseen images',
        desc: 'We check how well the model labels the images set aside at each step to see if performance rises.',
      },
    ],
    ctaButton: 'Run Learning Curve Check',
    durationNote: 'Typically takes 15–30 seconds. Runs in the background.',
  },

  ineligible: {
    title: 'Dataset Not Ready for Learning Curve',
    reasons: {
      not_profiled: {
        headline: 'Dataset Not Yet Profiled',
        message: 'This dataset has not been profiled yet. Run profiling first to extract image fingerprints.',
        action: 'Go to Profiling',
      },
      no_labels: {
        headline: 'No Class Labels Detected',
        message: 'No folder-based class taxonomy was found. Organise your images into class subfolders (e.g. /dogs, /cats) to enable learning curve analysis.',
        action: 'Organise Folders',
      },
      too_few_classes: {
        headline: 'Too Few Classes',
        message: 'At least 2 distinct classes are required to test classification ability.',
        action: 'Check Dataset Classes',
      },
      too_few_images: {
        headline: 'Too Few Images per Class',
        message: 'Each class needs at least 20 images to provide reliable test and training splits.',
        action: 'Add More Images',
      },
    },
  },

  chart: {
    title: 'Model Score vs. Training Images',
    xAxisLabel: 'Number of training images',
    yAxisLabel: 'Score on unseen images (%)',
    guessingLineLabel: 'Guessing',
    howToReadTitle: 'How to read this chart',
    howToReadBullets: [
      'A rising line means adding more images steadily helped the test model label unseen images correctly.',
      'A flat line means extra images added little benefit over a smaller initial set.',
      'The dashed line shows what random guessing would score across these classes.',
    ],
  },

  classes: {
    title: 'Which classes would gain from more images',
    subtitle: 'Compares accuracy with 25% of training photos against all training photos.',
    wouldBenefitBadge: 'Would benefit from more images',
    gainLabel: 'Gain with full dataset',
  },

  confusedPairs: {
    title: 'Look-alike classes',
    subtitle: 'Classes that the test model frequently confuses with one another.',
    emptyMessage: 'No frequent look-alike pairs detected. Classes remain visually distinct.',
  },

  mislabel: {
    title: 'Images worth a second look',
    subtitle: 'Photos that the test model strongly predicted as another class. These are suggestions to check, not confirmed errors.',
    exportCsvButton: 'Export list (CSV)',
    showAllButton: 'Show all 24 candidates',
    showFewerButton: 'Show top 12 only',
    emptyMessage: 'No high-confidence mislabel candidates identified. Labels appear consistent.',
  },

  methodology: {
    title: 'How this was measured',
    body: 'We evaluated a simple test model across repeated partitions of your dataset. In each test, images were divided into training and evaluation sets. Duplicate and near-duplicate images were isolated to prevent leaking identical photos between training and testing. At each step, the model learned from a subset of training images and was scored on held-out unseen images.',
    caveatsNote: 'Note: This provides a baseline estimate using foundational visual features. Larger deep-learning architectures fine-tuned specifically on your domain may achieve higher accuracy, and this test does not measure performance on out-of-distribution real-world camera photos.',
  },
};
