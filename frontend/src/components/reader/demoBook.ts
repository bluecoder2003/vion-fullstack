import type { Book } from "./ReaderContext";

/**
 * "Dracula — A Reading Demo"
 *
 * Five chapters engineered to showcase the ambient soundscape engine.
 * Each chapter triggers different scene detections as the narration progresses:
 *
 *   Ch 1 → morning → forest / nature → night
 *   Ch 2 → indoor / fire → night
 *   Ch 3 → storm → rain → wind
 *   Ch 4 → ocean → city
 *   Ch 5 → forest → river → snow → fire → morning (dawn)
 *
 * The entire book fits within the 12,000-char TTS preview budget so
 * audio is generated for all five chapters automatically.
 *
 * Source text: Bram Stoker, Dracula (1897) — public domain.
 */

const chapter1 = `3 May. Bistritz. — A golden morning greeted my departure from the inn at Bistritz, the sunrise painting the snow-capped peaks of the Carpathians in rose and amber. The village square was already alive at this early hour — market stalls setting up, the cries of the vendors rising with the mist that drifted from the valley below. I breakfasted well and took my seat in the coach as the first clear light of dawn touched the hillsides and woke the birdsong in the meadows around the town.

The road north wound through farmland at first, the fields green and new under the morning sky. But within the hour we were climbing into the hills, and the cultivated land gave way to woodland — great stands of beech and oak whose canopy closed overhead, dappling the track with shifting light and shadow. The forest here was old and deep, the floor thick with fern and moss, the ancient trees draped in lichen that gleamed silver when the light caught it. I caught glimpses of deer between the trunks, and the hollow knocking of a woodpecker carried through the still morning air.

We climbed through the afternoon. The valley fell away below us, the river reduced to a bright thread far down in the green, and the trees on either side of the track grew taller and darker as we rose. The birdsong thinned. The wind moved through the high branches with a sound that was almost a voice, a low and ceaseless sigh that followed us along the ridge.

Night fell before we reached the Borgo Pass. The moon rose full and cold over the eastern ridge, throwing the mountain road into sharp silver relief, and the first stars appeared in the gaps between the clouds. An owl called somewhere in the deep woodland below the road — once, twice, and then was silent. From somewhere further in the darkness a wolf howled, one long drawn note, and then the howling spread, voice after voice answering across the black hillsides, until the whole valley seemed to ring with it.

The coachman did not speak, did not slow. We drove on through the darkness, the horses' breath steaming in the cold night air, the stars blazing overhead, and the wolves singing somewhere below in the ancient forest.`;

const chapter2 = `Midnight. — The castle gates swung open before us without visible hand, and the Count himself stood in the entrance, a lamp held high. His long shadow fell across the courtyard stones behind him, and his face, illuminated by the upward light of the flame, was sharp and pale and very still.

"Welcome," he said, "to my house. Enter freely and of your own free will."

He led me through stone passages whose walls were hung with tapestries so old the figures on them had faded to ghosts, the lamplight throwing our shadows long and wavering ahead of us along the corridor floor. We passed doors of heavy oak and archways that opened into darkness beyond the lamp's reach, and at last he brought me to a great room that had been prepared for my arrival.

A fire blazed in the enormous hearth — logs of fragrant wood that sent sparks drifting up the chimney and cast warm golden light across the panelled walls and the bookshelves that lined them. Candles burned in clusters on the table where supper had been laid, their flames perfectly steady in the still air of the room, and more candles stood on the writing desk by the window. The fire was a comfort after the cold journey, and I drew my chair toward the warmth of the hearth without thinking.

The Count sat apart, in the shadows beyond the hearthlight. He watched while I ate, but did not himself eat or drink. When supper was done we moved to the fireside, and we talked until the embers had burned low and the candles guttered in their sticks.

When I was alone at last I stood at the window. The moon was high and bright, the sky around it deep blue-black and thick with stars. The castle walls fell sheer below me for a great height, and beyond the courtyard the mountains rose on every side, their summits white with snow, their forests below the treeline dark and immense. The warmth of the fire at my back and the cold clarity of the stars before me — I stood between them for a long while before I slept.`;

const chapter3 = `8 May. — The storm broke in the third week of my stay, without warning and with enormous violence.

I was writing at the desk when the first thunderclap struck directly overhead. The sound was a concussive crack that shook the window in its frame, and before the echo had finished rolling between the peaks the lightning came — a white and absolute flash that turned the mountains outside into a photograph, bleaching every colour from the world for a frozen instant, and then was gone, leaving a darkness that seemed deeper for the interruption.

The rain began immediately. It drove against the glass in sheets, hammered the stone sills, ran in rivers down the ancient walls outside. The thunder came again and again, each stroke closer and louder, until the whole castle seemed to resonate with it. The lightning was nearly continuous, strobe after strobe freezing the courtyard in stark black and white, and in those moments I could see the tempest at full work — the great pine on the slope below the south wall bending nearly double, the rain driving horizontal across the battlements, the puddles churning white.

The wind had risen to a howl that forced itself through every joint and crack in the masonry, set the corridor hangings billowing beyond my closed door, drove down the chimney in gusts that flattened the embers and sent sparks cascading across the hearthstone. The candles lost their fight one by one, until only the firelight remained, and even that was battered and uncertain.

I do not know how long the storm lasted. Time became difficult during those hours. The thunder was simply a permanent condition, and the lightning and the driving rain and the howling of the wind through the stones of the castle were the only real things in the world. Sometime near the worst of it, in a sustained flash of lightning, I watched the great pine fall — a vast slow lean out from the hillside and then the silence before the crash reached me, a silence immediately swallowed by the next peal of thunder.

By morning the sky was washed perfectly clean. The mountains were brilliant with fresh snow, the air sharp as crystal. The storm might have been a dream, but for the fallen tree and the flooded courtyard.`;

const chapter4 = `From Mina Murray's Journal. Whitby, 26 July. — The sea is magnificent today.

I am sitting on the cliff walk above the east shore, and the ocean stretches before me in every shade of blue and green, its surface broken by long white lines of surf rolling steadily in from the north. The tide is at its height, the waves breaking against the black rocks at the harbour mouth with a deep rhythmic crash that I can feel in the stones beneath me. The cliffs on either side of the bay stand stark and pale, and the sea-birds wheel and cry along them in endless circuits.

The town of Whitby climbs the cliff behind me, red-roofed and old, the ruined abbey on the headland above it making a jagged silhouette against the afternoon sky. In the streets below I can hear the sounds of the harbour market — the cries of the fish sellers, the rumble of iron-rimmed wheels on cobblestones, the clatter of horses on the narrow lanes. The fishing smacks are coming in with the afternoon tide, their nets dripping dark on the stone quayside, and the coachmen above on the cliff road urge their horses impatiently through the crowded street.

Yesterday a great ship came in from the east, driving before the last of the storm under every sail — a magnificent and frightening sight, the vessel heeling dangerously, the waves breaking clean over her bows. She came through the harbour mouth at impossible speed and drove hard aground on the sand below the cliff. When they boarded her at last, the helmsman was found lashed to his wheel — dead, and with his hands bound to the spokes — and a great dark shape leaped from her bows to shore and ran up the cliff path toward the churchyard before anyone could move.

In the evenings I walk along the harbour wall and watch the lights come on in the town, one by one, the inn windows warm and golden in the dusk, voices and laughter drifting across the cobblestones from within. The fishermen sit mending their nets on the quayside stones by feel, working in the gathering dark. And the sea goes on beyond the harbour mouth, black now and enormous, the waves still coming in from the north, patient and perpetual, as they have come since before the town existed.`;

const chapter5 = `6 November. — We came upon the Szgany camp at first light, the ashes of their fire still warm in the snow beside the river.

The forest here was old growth, oak and beech sixty feet above us, their bare November branches making a lattice against the grey sky. The snow lay deep and undisturbed under the trees, and the only sounds were the murmur of the stream running dark and cold along its snowy bank and the distant cry of ravens from the heights. We found the tracks of the wagon frozen into the mud at the water's edge and followed them north through the woodland.

Van Helsing built a campfire that night on the bank of the river. The fire burned high and fragrant in the winter air, throwing orange light across the snow and the dark columns of the forest pines, the sparks rising into darkness overhead. We sat around it and watched the stars appear between the branches, and we spoke very little. The river moved beside us in the dark, frozen at its margins, running fast and black in the centre where the cold current had kept the ice away.

We rode at dawn into a frost so heavy it had silvered every surface — the dead grass, the bare stones, the branches of the trees — and our breath steamed in the still air as we pushed the horses forward through the snow toward the high ground. The forest thinned as we climbed, giving way to open hillside, and ahead of us, high on its crag against the pale winter sky, the castle waited.

The sun was already low when we found the wagon. I will not dwell long on what followed — the confusion and the cold and the last desperate moments as the light left the western peaks. But it was done. And when it was done, a deep silence settled over the snow and the river and the ancient forest, a silence that felt earned, that felt final.

I heard Jonathan beside me in the stillness, and I took his hand. Above us the sky was turning from grey to rose to gold as the morning — the true morning, the first clear dawn I had seen in what felt like a lifetime — rose slowly over the mountains and touched the castle walls and turned the frost to fire.`;

export const draculaDemoBook: Book = {
  id:         "dracula-demo",
  title:      "Dracula",
  author:     "Bram Stoker",
  totalPages: 5,
  voice:      "bm_george",
  chapters: [
    {
      id:      "dracula-ch-1",
      title:   "I — The Road to Transylvania",
      page:    1,
      content: chapter1,
    },
    {
      id:      "dracula-ch-2",
      title:   "II — Castle Dracula",
      page:    2,
      content: chapter2,
    },
    {
      id:      "dracula-ch-3",
      title:   "III — The Storm",
      page:    3,
      content: chapter3,
    },
    {
      id:      "dracula-ch-4",
      title:   "IV — Whitby Harbour",
      page:    4,
      content: chapter4,
    },
    {
      id:      "dracula-ch-5",
      title:   "V — The Final Hunt",
      page:    5,
      content: chapter5,
    },
  ],
};
