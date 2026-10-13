// wzafterimage: exports Character.wz /Afterimage/<set> weapon swipe sprites as PNGs plus one JSON manifest per set.
//
// One-time bake, outputs are committed under public/sprites/afterimage/:
//
//	go run . <Character.wz> public/sprites/afterimage swordOL swordOS swordTS mace axe spear poleArm crossBow
//
// Source used: the GMS v83 Character.wz (GMS IV, version 83) from the MapleStoryUnity/wzData
// archive. Reads the file with github.com/anonymous5l/wzexplorer.
//
// Manifest shape (see src/lib/afterimage.ts): levels -> action -> frame index -> sprites[].
// Identical PNGs across levels are stored once, named by content hash.
package main

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/anonymous5l/wzexplorer"
)

type Sprite struct {
	Image string `json:"image"`
	OX    int    `json:"ox"`
	OY    int    `json:"oy"`
	Delay int    `json:"delay"`
	A0    int    `json:"a0"`
	A1    int    `json:"a1"`
}

type Action struct {
	// Body frame index the sprites start on -> sprites played in order.
	Frames map[string][]Sprite `json:"frames"`
	LT     *[2]int             `json:"lt,omitempty"`
	RB     *[2]int             `json:"rb,omitempty"`
}

func children(o wzexplorer.Object) map[string]wzexplorer.Object {
	out := map[string]wzexplorer.Object{}
	if g, ok := o.(wzexplorer.GetObject); ok {
		g.Each(func(n string, c wzexplorer.Object) error { out[n] = c; return nil })
	}
	return out
}

func intOf(o wzexplorer.Object, name string, def int) int {
	kids := children(o)
	c, ok := kids[name]
	if !ok {
		return def
	}
	return int(c.Int32())
}

func sorted(m map[string]wzexplorer.Object) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		a, ea := strconv.Atoi(keys[i])
		b, eb := strconv.Atoi(keys[j])
		if ea == nil && eb == nil {
			return a < b
		}
		return keys[i] < keys[j]
	})
	return keys
}

func main() {
	file, out := os.Args[1], os.Args[2]
	cp, err := wzexplorer.NewCryptProvider(83, wzexplorer.IvGMS)
	if err != nil {
		panic(err)
	}
	f, err := wzexplorer.NewFile(cp, file)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	saved := map[string]bool{}
	for _, set := range os.Args[3:] {
		root, err := f.Get("/Afterimage/" + set)
		if err != nil {
			panic(err)
		}
		dir := filepath.Join(out, set)
		os.MkdirAll(dir, 0o755)
		levels := map[string]map[string]*Action{}
		lk := children(root)
		for _, level := range sorted(lk) {
			if _, err := strconv.Atoi(level); err != nil {
				continue // "charge" etc. are skill variants, not weapon levels
			}
			actions := map[string]*Action{}
			ak := children(lk[level])
			for _, name := range sorted(ak) {
				act := &Action{Frames: map[string][]Sprite{}}
				bk := children(ak[name])
				for _, key := range sorted(bk) {
					node := bk[key]
					switch key {
					case "lt":
						v := node.Vector()
						act.LT = &[2]int{v.X, v.Y}
						continue
					case "rb":
						v := node.Vector()
						act.RB = &[2]int{v.X, v.Y}
						continue
					}
					sk := children(node)
					for _, idx := range sorted(sk) {
						c := sk[idx]
						if c.Type() != wzexplorer.ObjectTypeCanvas {
							continue
						}
						img, err := c.Canvas().Image()
						if err != nil {
							continue
						}
						var buf bytes.Buffer
						png.Encode(&buf, img)
						sum := sha1.Sum(buf.Bytes())
						name := hex.EncodeToString(sum[:6]) + ".png"
						if !saved[set+name] {
							os.WriteFile(filepath.Join(dir, name), buf.Bytes(), 0o644)
							saved[set+name] = true
						}
						kids := children(c)
						ox, oy := 0, 0
						if v, ok := kids["origin"]; ok {
							ox, oy = v.Vector().X, v.Vector().Y
						}
						act.Frames[key] = append(act.Frames[key], Sprite{
							Image: name, OX: ox, OY: oy,
							Delay: intOf(c, "delay", 100), A0: intOf(c, "a0", 255), A1: intOf(c, "a1", 255),
						})
					}
				}
				actions[name] = act
			}
			levels[level] = actions
		}
		data, _ := json.Marshal(map[string]any{"set": set, "levels": levels})
		os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0o644)
		fmt.Println(set, len(levels), "levels,", len(saved), "png total")
	}
}
