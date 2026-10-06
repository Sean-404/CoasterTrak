import type { ReactNode } from "react";
import {
  GuideH2,
  GuideH3,
  GuideLi,
  GuideLink,
  GuideOl,
  GuideP,
  GuideUl,
} from "@/components/guide-article";

export const GUIDE_BODIES: Record<string, ReactNode> = {
  "what-is-a-coaster-credit": (
    <>
      <GuideH2>The short answer</GuideH2>
      <GuideP>
        A coaster credit is a distinct roller coaster you have ridden at least once. Riding the same layout five
        times in a day is still one credit and five rides. Credits answer “what have I done?” Ride counts answer
        “how often?”
      </GuideP>
      <GuideP>
        Credits are not FastPasses, photo passes, or park tickets. They are a hobby counting system that grew among
        enthusiasts who wanted a fair way to compare experience without turning every re-ride into a new trophy.
      </GuideP>

      <GuideH2>Why people track credits at all</GuideH2>
      <GuideP>
        Theme parks blur together after a few seasons. Without a list, it is easy to forget whether you rode a
        particular clone install, a relocated coaster under a new name, or a family coaster you half-remember from a
        childhood trip. A credit log is memory with rules.
      </GuideP>
      <GuideP>
        It also changes how you plan days. Instead of wandering until the park closes, you look at leftovers —
        catalog rides you have not logged yet — and decide what is worth a queue. That habit is the difference
        between a fun park day and a focused credit hunt.
      </GuideP>

      <GuideH2>Unique credit vs total rides</GuideH2>
      <GuideP>
        Most credit hunters keep both numbers. Unique credits only go up when you sit on a coaster you have never
        logged. Total rides go up every time you dispatch, including marathons on the same train. Saying “I have 350
        credits and did 22 rides today” is normal conversation in this hobby.
      </GuideP>
      <GuideP>
        If you only care about the checklist, unique credits are enough. If you care about park days, seasons, and
        favourites, ride counts and dates make the log feel alive.{" "}
        <GuideLink href="/guides/unique-credits-vs-total-rides">
          Unique credits vs total rides
        </GuideLink>{" "}
        goes deeper on how to talk about both without mixing them up.
      </GuideP>

      <GuideH2>Edge cases people argue about</GuideH2>
      <GuideP>
        The community does not agree on every boundary. Common debates include powered coasters, indoor spinning
        “mice,” alpine coasters, and whether a relocated ride is a new credit or the same steel with a new paint
        job. There is no global referee.
      </GuideP>
      <GuideP>
        Practical approach: pick a rule you can explain, apply it consistently, and be honest when you compare with
        friends. CoasterTrak lets you log catalog coasters and filter Stats toward thrill rides when you want a
        tighter view — without deleting family credits from achievements or from friends who count every mouse.
      </GuideP>

      <GuideH2>How to start a tally without a spreadsheet</GuideH2>
      <GuideOl>
        <GuideLi>
          Browse the{" "}
          <GuideLink href="/map">map</GuideLink> or{" "}
          <GuideLink href="/parks">park list</GuideLink> for places you have already visited.
        </GuideLi>
        <GuideLi>Open a park page and mark rides you clearly remember. Undated older credits still count.</GuideLi>
        <GuideLi>
          On your next park day, log new credits in line or at the end of the day — see{" "}
          <GuideLink href="/guides/first-park-day-credit-log">the first park day guide</GuideLink>.
        </GuideLi>
        <GuideLi>
          When you travel with someone else, use friend compare to spot leftovers before you buy tickets.
        </GuideLi>
      </GuideOl>

      <GuideH2>Where CoasterTrak fits</GuideH2>
      <GuideP>
        CoasterTrak is a free browser coaster credit tracker. The catalog exists so each park installation is its
        own row — clone hardware at two parks should not collapse into one checkbox. Park pages are planning sheets;
        coaster pages are credit targets. Wikipedia extracts, when present, are background — not the article.
      </GuideP>
      <GuideP>
        For a product-focused overview, read the{" "}
        <GuideLink href="/coaster-credits">coaster credit tracker page</GuideLink> and the{" "}
        <GuideLink href="/catalog">catalog guide</GuideLink>.
      </GuideP>
    </>
  ),

  "first-park-day-credit-log": (
    <>
      <GuideH2>Goal for day one</GuideH2>
      <GuideP>
        Finish the park with a list you trust. You do not need perfect dates for every childhood ride on day one.
        You do need to capture new credits before the day blurs into “we rode a lot of stuff.”
      </GuideP>

      <GuideH2>Before you go</GuideH2>
      <GuideUl>
        <GuideLi>
          Open the park on CoasterTrak (
          <GuideLink href="/parks">parks list</GuideLink> or{" "}
          <GuideLink href="/map">map</GuideLink>) and skim the operating lineup.
        </GuideLi>
        <GuideLi>Log anything you already know you have ridden — even without dates.</GuideLi>
        <GuideLi>
          Note leftovers you care about. If you ride with a friend, compare tallies the night before so you share a
          target list.{" "}
          <GuideLink href="/guides/planning-park-leftovers">Planning leftovers</GuideLink> covers that workflow.
        </GuideLi>
        <GuideLi>Bookmark coastertrak.com on your phone. The web app is the tracker — no store install.</GuideLi>
      </GuideUl>

      <GuideH2>In the park</GuideH2>
      <GuideH3>Log in the queue when you can</GuideH3>
      <GuideP>
        The safest moment is while you wait. Search the ride, mark it ridden, add today’s date if you want history.
        If signal is bad, note the name in your phone notes and sync later the same evening — same-day memory is
        still fresh.
      </GuideP>
      <GuideH3>Do not wait until next week</GuideH3>
      <GuideP>
        After a big park day, names and layouts merge. “The blue one after lunch” is not a catalog row. A five-minute
        pass through your notes that night is worth more than an hour of guessing next month.
      </GuideP>
      <GuideH3>Re-rides are easy</GuideH3>
      <GuideP>
        Second and third laps do not create new credits. Add them as extra rides on the same credit so Stats can show
        both numbers. That matches how enthusiasts talk about the day.
      </GuideP>

      <GuideH2>A simple ride order mindset</GuideH2>
      <GuideP>
        Credit hunters often front-load must-do leftovers, then fill gaps with walk-ons and re-rides. Your order
        depends on rope-drop strategy, lightning-lane style products, and who you are with. The log does not force a
        strategy — it just makes leftovers visible so you choose deliberately.
      </GuideP>

      <GuideH2>After the park</GuideH2>
      <GuideOl>
        <GuideLi>Reconcile any notes into CoasterTrak while you still recognise train photos and park maps.</GuideLi>
        <GuideLi>Check the park page once more for operating rides with no credit.</GuideLi>
        <GuideLi>Wishlist anything you skipped on purpose for a return trip.</GuideLi>
        <GuideLi>
          If the day was a first big tally push, skim{" "}
          <GuideLink href="/guides/first-year-credit-hunting">first-year credit hunting</GuideLink> for how to pace
          the next trips.
        </GuideLi>
      </GuideOl>

      <GuideH2>Common first-day mistakes</GuideH2>
      <GuideUl>
        <GuideLi>Logging the wrong clone install because two parks share a name.</GuideLi>
        <GuideLi>Only remembering majors and forgetting family coasters you actually rode.</GuideLi>
        <GuideLi>Mixing “I walked past it” with “I rode it.”</GuideLi>
        <GuideLi>Assuming closed or seasonal rides are gone from the catalog — historical credits still matter.</GuideLi>
      </GuideUl>
      <GuideP>
        When a catalog row looks wrong, email the park, ride, and URL from the{" "}
        <GuideLink href="/contact">contact page</GuideLink>. The catalog is curated for tracking, not as a mirror of
        every encyclopedia page.
      </GuideP>
    </>
  ),

  "unique-credits-vs-total-rides": (
    <>
      <GuideH2>Two numbers, two jobs</GuideH2>
      <GuideP>
        Unique credits measure breadth: how many distinct coasters you have experienced. Total rides measure depth
        and activity: how often you dispatch, including marathons and home-park favourites.
      </GuideP>
      <GuideP>
        Mixing them creates nonsense. “I have 1,200 credits” when you mean rides confuses people. “I only have 40
        rides” when you mean unique credits undersells a serious checklist.
      </GuideP>

      <GuideH2>How a single park day looks</GuideH2>
      <GuideP>
        Suppose you ride eight different coasters and re-ride two of them three times each. That day might add eight
        unique credits (if they were all new) and fourteen total rides. If six were already in your log, you add two
        credits and fourteen rides. Same sweaty day — different credit delta.
      </GuideP>

      <GuideH2>Why dates help</GuideH2>
      <GuideP>
        Dates turn a checkbox into a history. First-ridden matters when a ride relocates or closes. Last-ridden
        matters when you return after years. Undated older credits still belong in the unique total; they just will
        not sort cleanly into a year Wrapped view.
      </GuideP>
      <GuideP>
        CoasterTrak stores both the unique credit and ride quantities so Stats can show the tally enthusiasts
        actually say out loud. Achievements can still count every logged credit even when you filter the thrill-ride
        view for day-to-day browsing.
      </GuideP>

      <GuideH2>Talking with friends</GuideH2>
      <GuideP>
        When you compare with someone else, lead with unique credits for “what overlap do we have?” Use ride counts
        for “who is obsessed with this one layout?” Friend compare on CoasterTrak is built around leftover credits —
        rides only they have — which is the useful trip question. See{" "}
        <GuideLink href="/guides/planning-park-leftovers">planning park leftovers</GuideLink>.
      </GuideP>

      <GuideH2>Family coasters and filters</GuideH2>
      <GuideP>
        Some people filter family and kiddie credits out of their “serious” tally conversation. Others count every
        catalog row. Neither side owns the hobby. Log what you rode; use filters when you want a thrill-only view.
        Do not delete history just to win an argument about definitions —{" "}
        <GuideLink href="/guides/what-is-a-coaster-credit">what counts as a credit</GuideLink> is already fuzzy at
        the edges.
      </GuideP>

      <GuideH2>Quick reference</GuideH2>
      <GuideUl>
        <GuideLi>
          <strong>New layout you have never logged</strong> → +1 unique credit, +1 ride (or more if you re-ride).
        </GuideLi>
        <GuideLi>
          <strong>Re-ride of a logged coaster</strong> → +0 unique credits, +N rides.
        </GuideLi>
        <GuideLi>
          <strong>Defunct ride you did years ago</strong> → still a unique credit if you log it.
        </GuideLi>
      </GuideUl>
    </>
  ),

  "planning-park-leftovers": (
    <>
      <GuideH2>What “leftovers” means</GuideH2>
      <GuideP>
        Leftover credits are catalog coasters at a park that you have not logged yet. They are the planning surface
        between “I like this park” and “here is what I still need.” Without leftovers, every visit restarts from
        vibes and Instagram.
      </GuideP>

      <GuideH2>Solo planning in ten minutes</GuideH2>
      <GuideOl>
        <GuideLi>
          Open the park page on CoasterTrak and confirm the operating versus historical split.
        </GuideLi>
        <GuideLi>Log rides you already have so the remaining list is honest.</GuideLi>
        <GuideLi>Wishlist anything you will skip this trip but want later.</GuideLi>
        <GuideLi>
          On park day, work the leftover list in an order that fits crowds — then log as you go (
          <GuideLink href="/guides/first-park-day-credit-log">first park day guide</GuideLink>).
        </GuideLi>
      </GuideOl>

      <GuideH2>Planning with friends</GuideH2>
      <GuideP>
        Shared trips fail when everyone assumes the same checklist. After you add a friend on CoasterTrak, Compare
        shows rides you both have, credits only they have, and park-scoped leftovers. Filter to the park you are
        visiting and you get a ride order that respects both tallies — not just the biggest number.
      </GuideP>
      <GuideP>
        That is usually more useful than a global leaderboard. The question before tickets is “which of these have I
        still not done?” not “who is winning.”
      </GuideP>

      <GuideH2>Clone installs and wrong parks</GuideH2>
      <GuideP>
        Same marketing name at two parks does not mean one credit. CoasterTrak keeps separate catalog rows per
        installation so a closed Ride of Steel does not hide an operating clone elsewhere. Always open the park you
        are standing in. The{" "}
        <GuideLink href="/catalog">catalog guide</GuideLink> explains sourcing and how to report a wrong link.
      </GuideP>

      <GuideH2>Wishlist vs credit</GuideH2>
      <GuideP>
        Wishlist means “I want this.” Credit means “I rode this.” Mixing them creates false leftovers. Keep wishlist
        for future trips and credits for truth. When a wishlist item is done, log the credit and clear the wish so
        your next visit starts clean.
      </GuideP>

      <GuideH2>Defunct and seasonal rides</GuideH2>
      <GuideP>
        Historical credits still belong in a unique tally. Seasonal or temporarily closed rides may stay on the
        park list with a status — confirm with the park before you travel. Catalog pages can be incomplete; treat
        them as a tracker aid, not a live operations feed.
      </GuideP>
    </>
  ),

  "first-year-credit-hunting": (
    <>
      <GuideH2>What a good first year looks like</GuideH2>
      <GuideP>
        A strong first year is not the biggest number you can force. It is a tally you understand, a few parks you
        know deeply, and habits that still feel fun in October. Burnout from checklist tourism is real — especially
        if every weekend becomes a logistics problem instead of a park day.
      </GuideP>

      <GuideH2>Pick parks that teach the hobby</GuideH2>
      <GuideP>
        Early trips should teach you how credits work in practice: clone names, family vs thrill filtering, and how
        leftovers change your path through a park. Dense lineups help because you practice logging and planning in
        one visit. Famous destination parks are great; so are strong regional parks you can return to.
      </GuideP>
      <GuideP>
        Use CoasterTrak’s{" "}
        <GuideLink href="/map">map</GuideLink> to see what is near you, then open park pages to inspect operating
        counts and notable rides. Browse{" "}
        <GuideLink href="/parks">parks</GuideLink> when you are planning a longer trip across a country.
      </GuideP>

      <GuideH2>A simple year-one framework</GuideH2>
      <GuideOl>
        <GuideLi>
          <strong>Home park depth</strong> — log everything you can at parks you already visit. Cheap credits and
          clean habits.
        </GuideLi>
        <GuideLi>
          <strong>One or two destination trips</strong> — parks with lineups you have never touched. Plan leftovers
          ahead (
          <GuideLink href="/guides/planning-park-leftovers">leftovers guide</GuideLink>).
        </GuideLi>
        <GuideLi>
          <strong>One nostalgia pass</strong> — log childhood and teenage rides you actually remember. Undated is
          fine.
        </GuideLi>
        <GuideLi>
          <strong>Friends as multipliers</strong> — shared trips with compare lists beat solo FOMO scrolling.
        </GuideLi>
      </GuideOl>

      <GuideH2>What “fast tally” really means</GuideH2>
      <GuideP>
        Adding fifty credits in a weekend is possible at the right park and a waste if you remember none of them.
        Fast tally done well means you leave with logged credits, a few re-rides on favourites, and a wishlist for
        next time — not a blur of steel.
      </GuideP>
      <GuideP>
        Track unique credits and total rides separately so a marathon day does not look like fifty new credits when
        it was five.{" "}
        <GuideLink href="/guides/unique-credits-vs-total-rides">Unique vs total</GuideLink> keeps the language clean.
      </GuideP>

      <GuideH2>Keep the hobby human</GuideH2>
      <GuideUl>
        <GuideLi>Leave room for non-coaster park time if you travel with mixed groups.</GuideLi>
        <GuideLi>Do not delete family credits to impress strangers online.</GuideLi>
        <GuideLi>Celebrate park days, not only the global number.</GuideLi>
        <GuideLi>
          Play <GuideLink href="/guess">CoasterGuessr</GuideLink> between trips to stay sharp on photos — then log
          the real credit when you visit.
        </GuideLi>
      </GuideUl>

      <GuideH2>Where to go next on CoasterTrak</GuideH2>
      <GuideP>
        Start a free log from{" "}
        <GuideLink href="/login">signup</GuideLink>, read{" "}
        <GuideLink href="/guides/what-is-a-coaster-credit">what a credit is</GuideLink>, and keep the{" "}
        <GuideLink href="/coaster-tracker">coaster tracker guide</GuideLink> handy for map, wishlist, and stats
        screens.
      </GuideP>
    </>
  ),

  "coasterguessr-photo-game": (
    <>
      <GuideH2>What CoasterGuessr is</GuideH2>
      <GuideP>
        CoasterGuessr is CoasterTrak’s free photo guessing game. You see a coaster image and try to identify the
        ride or park context — a lightweight way to train pattern recognition between real park visits.
      </GuideP>
      <GuideP>
        It is not a replacement for logging credits. It is a practice loop: notice manufacturer signatures, support
        styles, station architecture, and landscape clues, then take that eye into the park.
      </GuideP>

      <GuideH2>How to get better at reading photos</GuideH2>
      <GuideUl>
        <GuideLi>Look at supports and track colour before the train — clones often share hardware DNA.</GuideLi>
        <GuideLi>Station roofs, thematic props, and background terrain beat logo crops.</GuideLi>
        <GuideLi>Defunct rides still appear in photo sets; catalog status on CoasterTrak helps later.</GuideLi>
        <GuideLi>When you guess wrong, open the real coaster or park page and skim the lineup facts.</GuideLi>
      </GuideUl>

      <GuideH2>Connecting guesses to your credit log</GuideH2>
      <GuideP>
        Saw a ride you have actually been on? Log it if it is missing. Saw a leftover at a park you are visiting
        soon? Wishlist it and plan with{" "}
        <GuideLink href="/guides/planning-park-leftovers">park leftovers</GuideLink>. The game feeds curiosity; the
        tracker stores truth.
      </GuideP>

      <GuideH2>Play fair with yourself</GuideH2>
      <GuideP>
        Use guesses as learning, not as a substitute for riding. A correct CoasterGuessr answer is not a credit.
        Credits still require the seatbelt click — see{" "}
        <GuideLink href="/guides/what-is-a-coaster-credit">what is a coaster credit</GuideLink>.
      </GuideP>

      <GuideH2>Try it</GuideH2>
      <GuideP>
        Open <GuideLink href="/guess">CoasterGuessr</GuideLink> in your browser, then browse the{" "}
        <GuideLink href="/coasters">coasters list</GuideLink> or{" "}
        <GuideLink href="/map">map</GuideLink> when you want the full catalog context behind a photo.
      </GuideP>
    </>
  ),
};
