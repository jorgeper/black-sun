// What a space with no terminal shows: the pane of its placeholder tab (spaces-tree's empty.js
// gives each space one, put away while the space has other tabs). It offers
// what + in the tab bar does: a terminal or an agent, added to this space.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, openOverlay } from "herdr";

export default class EmptySpace extends View {
  render() {
    const t = theme();
    return v_flex().size_full().items_center().justify_center().gap(10).bg(t.background)
      .child(div().text_size(14).text_color(t.muted).child("Nothing in this space yet"))
      .child(div().text_size(12).text_color(t.dim).child("The space stays until you close it."))
      .child(h_flex().id("empty-add").h(30).px(12).gap(8).mt(4).items_center().border(1).border_color(t.border).text_size(12.5).text_color(t.muted).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
        .child(svg("mods/workspace-chrome/plus.svg").size(13).flex_none())
        .child("Add terminal or agent"));
  }
}
